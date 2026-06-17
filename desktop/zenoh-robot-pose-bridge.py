#!/usr/bin/env python3
import argparse
import json
import math
import os
import signal
import struct
import threading
import time


CDR_HEADER_SIZE = 4
POSE_DOUBLE_COUNT = 7
DEFAULT_POSE_TOPICS = (
    "robot_pose",
    "laser_pose",
)
DEFAULT_FALLBACK_DELAY_SECONDS = 2.0

running = True


def emit(message):
    print(json.dumps(message, separators=(",", ":")), flush=True)


def handle_stop(_signum, _frame):
    global running
    running = False


def start_parent_monitor(parent_pid):
    if parent_pid <= 0:
        return

    def monitor():
        global running
        while running:
            if os.getppid() != parent_pid:
                running = False
                break
            time.sleep(1)

    threading.Thread(target=monitor, daemon=True).start()


def align_cdr_offset(offset, alignment, base_offset=0):
    remainder = (offset - base_offset) % alignment
    return offset if remainder == 0 else offset + alignment - remainder


def get_cdr_endian(payload):
    if len(payload) < CDR_HEADER_SIZE:
        return None

    big = struct.unpack_from(">H", payload, 0)[0]
    if big in (0, 2):
        return ">"
    if big in (1, 3):
        return "<"

    little = struct.unpack_from("<H", payload, 0)[0]
    if little in (0, 2):
        return ">"
    if little in (1, 3):
        return "<"

    return None


def quaternion_to_euler(x, y, z, w):
    sin_roll = 2 * (w * x + y * z)
    cos_roll = 1 - 2 * (x * x + y * y)
    roll = math.atan2(sin_roll, cos_roll)

    sin_pitch = 2 * (w * y - z * x)
    pitch = math.copysign(math.pi / 2, sin_pitch) if abs(sin_pitch) >= 1 else math.asin(sin_pitch)

    sin_yaw = 2 * (w * z + x * y)
    cos_yaw = 1 - 2 * (y * y + z * z)
    yaw = math.atan2(sin_yaw, cos_yaw)

    return roll, pitch, yaw


def create_pose_message(values):
    if len(values) != POSE_DOUBLE_COUNT or not all(math.isfinite(value) for value in values):
        return None

    position_x, position_y, position_z, orientation_x, orientation_y, orientation_z, orientation_w = values
    quaternion_norm = math.hypot(orientation_x, orientation_y, orientation_z, orientation_w)
    if not math.isfinite(quaternion_norm) or quaternion_norm < 0.5 or quaternion_norm > 1.5:
        return None

    normalized_x = orientation_x / quaternion_norm
    normalized_y = orientation_y / quaternion_norm
    normalized_z = orientation_z / quaternion_norm
    normalized_w = orientation_w / quaternion_norm
    roll, pitch, yaw = quaternion_to_euler(normalized_x, normalized_y, normalized_z, normalized_w)

    return {
        "position": {
            "x": position_x,
            "y": position_y,
            "z": position_z,
        },
        "orientation": {
            "x": normalized_x,
            "y": normalized_y,
            "z": normalized_z,
            "w": normalized_w,
        },
        "pyr": {
            "yaw": yaw,
            "pitch": pitch,
            "roll": roll,
        },
    }


def read_pose_values(payload, endian, aligned):
    values = []
    offset = CDR_HEADER_SIZE

    for _ in range(POSE_DOUBLE_COUNT):
        if aligned:
            offset = align_cdr_offset(offset, 8)
        if offset + 8 > len(payload):
            return None

        values.append(struct.unpack_from(f"{endian}d", payload, offset)[0])
        offset += 8

    return values


def decode_pose_payload(payload):
    endian = get_cdr_endian(payload)
    if endian is None:
        return None

    for aligned in (True, False):
        values = read_pose_values(payload, endian, aligned)
        if values is None:
            continue
        pose = create_pose_message(values)
        if pose is not None:
            return pose

    return None


def normalize_pose_topics(namespace, topics):
    namespace = namespace.strip("/")
    normalized = {}

    for topic in topics:
        topic = topic.strip("/")
        if not topic:
            continue

        key_expr = topic if topic.startswith(f"{namespace}/") else f"{namespace}/{topic}"
        normalized[key_expr] = topic.rsplit("/", 1)[-1]

    return normalized


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", required=True)
    parser.add_argument("--namespace", required=True)
    parser.add_argument("--port", type=int, default=7447)
    parser.add_argument("--parent-pid", type=int, default=0)
    parser.add_argument("--pose-topic", action="append", default=[])
    parser.add_argument("--fallback-delay-ms", type=int, default=int(DEFAULT_FALLBACK_DELAY_SECONDS * 1000))
    parser.add_argument("--max-samples", type=int, default=0)
    return parser.parse_args()


def main():
    args = parse_args()
    start_parent_monitor(args.parent_pid)
    pose_key_sources = normalize_pose_topics(args.namespace, args.pose_topic or DEFAULT_POSE_TOPICS)
    pose_keys = list(pose_key_sources.keys())

    try:
        import zenoh
    except Exception as error:
        emit({
            "type": "error",
            "message": f"Failed to import eclipse-zenoh: {error}",
        })
        return 1

    config = zenoh.Config()
    config.insert_json5("mode", "\"client\"")
    config.insert_json5("connect/endpoints", json.dumps([f"tcp/{args.host}:{args.port}"]))
    config.insert_json5("scouting/multicast/enabled", "false")
    config.insert_json5("scouting/gossip/enabled", "false")
    config.insert_json5("transport/shared_memory/enabled", "false")

    session = None
    subscribers = []
    sample_count = 0
    active_pose_key = None
    active_pose_priority = len(pose_keys)
    started_at = time.monotonic()
    fallback_delay_seconds = max(args.fallback_delay_ms, 0) / 1000

    def on_sample(sample):
        nonlocal active_pose_key, active_pose_priority, sample_count

        key = str(sample.key_expr)
        try:
            pose_priority = pose_keys.index(key)
        except ValueError:
            return
        if active_pose_key is not None and pose_priority > active_pose_priority:
            return
        if active_pose_key is None and pose_priority > 0 and time.monotonic() - started_at < fallback_delay_seconds:
            return

        payload = sample.payload.to_bytes()
        pose = decode_pose_payload(payload)
        if pose is None:
            emit({
                "type": "decode-error",
                "key": key,
                "byteLength": len(payload),
            })
            return

        if active_pose_key != key:
            active_pose_key = key
            active_pose_priority = pose_priority
            emit({
                "type": "status",
                "state": "active-source",
                "key": key,
                "source": pose_key_sources.get(key, "pose"),
            })

        emit({
            "type": "pose",
            "key": key,
            "source": pose_key_sources.get(key, "pose"),
            "pose": pose,
        })
        sample_count += 1
        if args.max_samples > 0 and sample_count >= args.max_samples:
            handle_stop(None, None)

    try:
        emit({
            "type": "status",
            "state": "connecting",
            "endpoint": f"tcp/{args.host}:{args.port}",
            "keys": pose_keys,
            "source": "priority_pose",
            "fallbackDelayMs": args.fallback_delay_ms,
        })
        session = zenoh.open(config)
        subscribers = [session.declare_subscriber(key, on_sample) for key in pose_keys]
        emit({
            "type": "status",
            "state": "subscribed",
            "keys": pose_keys,
            "source": "priority_pose",
            "fallbackDelayMs": args.fallback_delay_ms,
        })

        while running:
            time.sleep(0.2)
    except Exception as error:
        emit({
            "type": "error",
            "message": str(error),
        })
        return 1
    finally:
        for subscriber in subscribers:
            subscriber.undeclare()
        if session is not None:
            session.close()

    return 0


signal.signal(signal.SIGINT, handle_stop)
signal.signal(signal.SIGTERM, handle_stop)

if __name__ == "__main__":
    raise SystemExit(main())
