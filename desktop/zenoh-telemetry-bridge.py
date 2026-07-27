#!/usr/bin/env python3
import argparse
import base64
import json
import math
import os
import signal
import struct
import sys
import threading
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET


CDR_HEADER_SIZE = 4
POSE_DOUBLE_COUNT = 7

BASE_SUBSCRIPTIONS = {
    "battery/state": "battery",
    "battery2/state": "battery2",
}

SCAN_SUBSCRIPTIONS = {
    "laser_pose": "laser-pose",
}

DEFAULT_SCAN_TOPICS = ["scan/filtered"]
DEFAULT_TF_TOPICS = (
    "tf",
    "tf_static",
)
DEFAULT_TARGET_FRAMES = (
    "base_footprint",
    "base_link",
    "base",
)

MAP_SUBSCRIPTIONS = {
    "map/compressed": "compressed-map",
}

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


class CdrDecodeError(Exception):
    pass


class CdrReader:
    def __init__(self, payload, endian, aligned, base_offset=0):
        self.payload = payload
        self.endian = endian
        self.aligned = aligned
        self.base_offset = base_offset
        self.offset = CDR_HEADER_SIZE

    def align(self, alignment):
        if self.aligned:
            self.offset = align_cdr_offset(self.offset, alignment, self.base_offset)

    def read(self, format_code, size, alignment):
        self.align(alignment)
        if self.offset + size > len(self.payload):
            raise CdrDecodeError("payload ended before field")

        value = struct.unpack_from(f"{self.endian}{format_code}", self.payload, self.offset)[0]
        self.offset += size
        return value

    def read_bool(self):
        return bool(self.read("?", 1, 1))

    def read_uint8(self):
        return self.read("B", 1, 1)

    def read_int32(self):
        return self.read("i", 4, 4)

    def read_uint32(self):
        return self.read("I", 4, 4)

    def read_float32(self):
        return self.read("f", 4, 4)

    def read_float64(self):
        return self.read("d", 8, 8)

    def read_string(self):
        length = self.read_uint32()
        if length < 0 or self.offset + length > len(self.payload):
            raise CdrDecodeError("invalid string length")

        value = self.payload[self.offset:self.offset + length]
        self.offset += length
        return value.split(b"\0", 1)[0].decode("utf-8", errors="replace")

    def skip_time(self):
        self.read_int32()
        self.read_uint32()

    def skip_string(self):
        self.read_string()

    def read_float32_sequence(self):
        length = self.read_uint32()
        values = []
        for _ in range(length):
            values.append(self.read_float32())
        return values


def normalize_frame_id(frame_id):
    return frame_id.strip().strip("/")


def rpy_to_quaternion(roll, pitch, yaw):
    half_roll = roll * 0.5
    half_pitch = pitch * 0.5
    half_yaw = yaw * 0.5
    cr = math.cos(half_roll)
    sr = math.sin(half_roll)
    cp = math.cos(half_pitch)
    sp = math.sin(half_pitch)
    cy = math.cos(half_yaw)
    sy = math.sin(half_yaw)
    return normalize_quaternion([
        sr * cp * cy - cr * sp * sy,
        cr * sp * cy + sr * cp * sy,
        cr * cp * sy - sr * sp * cy,
        cr * cp * cy + sr * sp * sy,
    ])


def normalize_quaternion(quaternion):
    x, y, z, w = quaternion
    norm = math.hypot(x, y, z, w)
    if not math.isfinite(norm) or norm < 1e-9:
        return None

    return [value / norm for value in quaternion]


def multiply_quaternions(left, right):
    ax, ay, az, aw = left
    bx, by, bz, bw = right
    return [
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    ]


def conjugate_quaternion(quaternion):
    x, y, z, w = quaternion
    return [-x, -y, -z, w]


def rotate_vector(quaternion, vector):
    q_vector = [vector[0], vector[1], vector[2], 0]
    rotated = multiply_quaternions(multiply_quaternions(quaternion, q_vector), conjugate_quaternion(quaternion))
    return rotated[:3]


def compose_transforms(left, right):
    rotation = normalize_quaternion(multiply_quaternions(left["rotation"], right["rotation"]))
    if rotation is None:
        return None

    rotated_translation = rotate_vector(left["rotation"], right["translation"])
    return {
        "translation": [
            left["translation"][0] + rotated_translation[0],
            left["translation"][1] + rotated_translation[1],
            left["translation"][2] + rotated_translation[2],
        ],
        "rotation": rotation,
    }


def invert_transform(transform):
    inverse_rotation = conjugate_quaternion(transform["rotation"])
    inverse_translation = rotate_vector(inverse_rotation, [
        -transform["translation"][0],
        -transform["translation"][1],
        -transform["translation"][2],
    ])
    return {
        "translation": inverse_translation,
        "rotation": inverse_rotation,
    }


def identity_transform():
    return {
        "translation": [0, 0, 0],
        "rotation": [0, 0, 0, 1],
    }


def apply_transform(transform, point):
    rotated = rotate_vector(transform["rotation"], point)
    return [
        rotated[0] + transform["translation"][0],
        rotated[1] + transform["translation"][1],
        rotated[2] + transform["translation"][2],
    ]


class TransformStore:
    def __init__(self):
        self.transforms_by_child = {}

    def update(self, transforms, is_static):
        for transform in transforms:
            parent = normalize_frame_id(transform["parent"])
            child = normalize_frame_id(transform["child"])
            if not parent or not child or parent == child:
                continue

            self.transforms_by_child[child] = {
                "parent": parent,
                "child": child,
                "translation": transform["translation"],
                "rotation": transform["rotation"],
                "stamp": transform["stamp"],
                "static": is_static,
            }

    def find_transform(self, source_frame, target_frames):
        source = normalize_frame_id(source_frame)
        targets = [normalize_frame_id(frame) for frame in target_frames if normalize_frame_id(frame)]
        if not source or not targets:
            return None, None

        snapshot = list(self.transforms_by_child.values())
        neighbors = {}
        for transform in snapshot:
            parent = transform["parent"]
            child = transform["child"]
            parent_from_child = {
                "translation": transform["translation"],
                "rotation": transform["rotation"],
            }
            child_from_parent = invert_transform(parent_from_child)
            neighbors.setdefault(child, []).append((parent, parent_from_child))
            neighbors.setdefault(parent, []).append((child, child_from_parent))

        for target in targets:
            if source == target:
                return identity_transform(), target

            queue = [(source, identity_transform())]
            visited = {source}

            for current_frame, current_from_source in queue:
                if current_frame == target:
                    return current_from_source, target

                if len(visited) > 128:
                    break

                for next_frame, next_from_current in neighbors.get(current_frame, []):
                    if next_frame in visited:
                        continue

                    next_from_source = compose_transforms(next_from_current, current_from_source)
                    if next_from_source is None:
                        continue

                    visited.add(next_frame)
                    queue.append((next_frame, next_from_source))

        return None, None

    def frame_count(self):
        frames = set()
        for transform in self.transforms_by_child.values():
            frames.add(transform["parent"])
            frames.add(transform["child"])
        return len(frames)


def parse_float_triplet(value, default):
    if not value:
        return default

    parts = value.split()
    if len(parts) != 3:
        return default

    try:
        parsed = [float(part) for part in parts]
    except ValueError:
        return default

    if not all(math.isfinite(part) for part in parsed):
        return default

    return parsed


def transform_key(transform):
    return (normalize_frame_id(transform["parent"]), normalize_frame_id(transform["child"]))


def infer_camera_optical_transforms(transforms):
    existing_keys = {transform_key(transform) for transform in transforms}
    inferred = []
    optical_rotation = rpy_to_quaternion(-math.pi / 2, 0, -math.pi / 2)
    if optical_rotation is None:
        return inferred

    for transform in transforms:
        child = normalize_frame_id(transform["child"])
        if not child.startswith("camera_") or not child.endswith("_link"):
            continue

        camera_name = child[:-5]
        for optical_frame in (
            f"{camera_name}_color_optical_frame",
            f"{camera_name}_depth_optical_frame",
        ):
            key = (child, optical_frame)
            if key in existing_keys:
                continue

            inferred.append({
                "parent": child,
                "child": optical_frame,
                "translation": [0, 0, 0],
                "rotation": optical_rotation,
                "stamp": {
                    "sec": 0,
                    "nanosec": 0,
                },
            })
            existing_keys.add(key)

    return inferred


def parse_urdf_static_transforms(urdf):
    root = ET.fromstring(urdf)
    transforms = []

    for joint in root.findall("joint"):
        if joint.attrib.get("type") != "fixed":
            continue

        parent_element = joint.find("parent")
        child_element = joint.find("child")
        if parent_element is None or child_element is None:
            continue

        parent = parent_element.attrib.get("link", "")
        child = child_element.attrib.get("link", "")
        if not parent or not child:
            continue

        origin_element = joint.find("origin")
        xyz = [0, 0, 0]
        rpy = [0, 0, 0]
        if origin_element is not None:
            xyz = parse_float_triplet(origin_element.attrib.get("xyz", ""), xyz)
            rpy = parse_float_triplet(origin_element.attrib.get("rpy", ""), rpy)

        rotation = rpy_to_quaternion(rpy[0], rpy[1], rpy[2])
        if rotation is None:
            continue

        transforms.append({
            "parent": parent,
            "child": child,
            "translation": xyz,
            "rotation": rotation,
            "stamp": {
                "sec": 0,
                "nanosec": 0,
            },
        })

    transforms.extend(infer_camera_optical_transforms(transforms))
    return transforms


def build_controller_url(host, path):
    if host.startswith("http://") or host.startswith("https://"):
        base = host.rstrip("/")
    else:
        base = f"http://{host}:5000"

    return f"{base}/{path.lstrip('/')}"


def fetch_urdf_static_transforms(host):
    url = build_controller_url(host, "/parameter/urdf_raw")
    request = urllib.request.Request(url, headers={"x-api-key": "1234567890"})
    with urllib.request.urlopen(request, timeout=5) as response:
        body = json.loads(response.read().decode("utf-8"))

    if body.get("code") != 0:
        raise RuntimeError(body.get("message") or "URDF endpoint returned an error")

    urdf = body.get("data", {}).get("urdf", "")
    if not urdf:
        raise RuntimeError("URDF endpoint did not return data.urdf")

    return parse_urdf_static_transforms(urdf)


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


def decode_pose_payload(payload):
    endian = get_cdr_endian(payload)
    if endian is None:
        return None

    for aligned in (True, False):
        try:
            reader = CdrReader(payload, endian, aligned)
            values = [reader.read_float64() for _ in range(POSE_DOUBLE_COUNT)]
            pose = create_pose_message(values)
            if pose is not None:
                return pose
        except CdrDecodeError:
            continue

    return None


def decode_battery_payload(payload):
    endian = get_cdr_endian(payload)
    if endian is None:
        return None

    for aligned in (True, False):
        try:
            reader = CdrReader(payload, endian, aligned)
            reader.skip_time()
            reader.skip_string()
            reader.read_float32()
            reader.read_float32()
            current = reader.read_float32()
            reader.read_float32()
            reader.read_float32()
            reader.read_float32()
            percentage = reader.read_float32()
            if not math.isfinite(current) or not math.isfinite(percentage):
                return None
            return {
                "battery": percentage * 100,
                "batteryCurrent": current,
            }
        except CdrDecodeError:
            continue

    return None


def decode_laser_scan_payload(payload):
    endian = get_cdr_endian(payload)
    if endian is None:
        return None

    for aligned in (True, False):
        try:
            reader = CdrReader(payload, endian, aligned)
            stamp_sec = reader.read_int32()
            stamp_nanosec = reader.read_uint32()
            frame_id = reader.read_string()
            angle_min = reader.read_float32()
            reader.read_float32()
            angle_increment = reader.read_float32()
            reader.read_float32()
            reader.read_float32()
            range_min = reader.read_float32()
            range_max = reader.read_float32()
            invalid_range = range_max + 1 if math.isfinite(range_max) else 0
            ranges = [
                value if math.isfinite(value) else invalid_range
                for value in reader.read_float32_sequence()
            ]
            return {
                "frameId": frame_id,
                "stamp": {
                    "sec": stamp_sec,
                    "nanosec": stamp_nanosec,
                },
                "angleMin": angle_min,
                "angleIncrement": angle_increment,
                "rangeMin": range_min,
                "rangeMax": range_max,
                "ranges": ranges,
            }
        except CdrDecodeError:
            continue

    return None


def decode_tf_payload_with_reader(reader):
    transform_count = reader.read_uint32()
    if transform_count > 2048:
        raise CdrDecodeError("invalid transform count")

    transforms = []
    for _ in range(transform_count):
        stamp_sec = reader.read_int32()
        stamp_nanosec = reader.read_uint32()
        parent = reader.read_string()
        child = reader.read_string()
        translation = [
            reader.read_float64(),
            reader.read_float64(),
            reader.read_float64(),
        ]
        rotation = normalize_quaternion([
            reader.read_float64(),
            reader.read_float64(),
            reader.read_float64(),
            reader.read_float64(),
        ])
        if rotation is None:
            continue
        if not all(math.isfinite(value) for value in translation):
            continue
        if any(abs(value) > 1e6 for value in translation):
            continue

        transforms.append({
            "parent": parent,
            "child": child,
            "translation": translation,
            "rotation": rotation,
            "stamp": {
                "sec": stamp_sec,
                "nanosec": stamp_nanosec,
            },
        })

    return transforms


def decode_tf_payload(payload):
    endian = get_cdr_endian(payload)
    if endian is None:
        return None

    for aligned in (True, False):
        for base_offset in (0, CDR_HEADER_SIZE):
            try:
                transforms = decode_tf_payload_with_reader(CdrReader(payload, endian, aligned, base_offset))
                if transforms:
                    return transforms
            except CdrDecodeError:
                continue

    for aligned in (True, False):
        try:
            transforms = decode_tf_payload_with_reader(CdrReader(payload, endian, aligned))
            if transforms:
                return transforms
        except CdrDecodeError:
            continue

    return None


def apply_tf_to_scan(scan, transform_store, target_frames):
    source_frame = scan.get("frameId", "")
    transform, target_frame = transform_store.find_transform(source_frame, target_frames)
    scan["originalFrameId"] = source_frame
    scan["targetFrameId"] = target_frame or (target_frames[0] if target_frames else "")
    scan["tfFrameCount"] = transform_store.frame_count()

    if transform is None:
        scan["transformApplied"] = False
        return scan

    points = []
    angle = scan["angleMin"]
    for range_value in scan["ranges"]:
        if math.isfinite(range_value) and scan["rangeMin"] <= range_value <= scan["rangeMax"]:
            points.append(apply_transform(transform, [
                range_value * math.cos(angle),
                range_value * math.sin(angle),
                0,
            ]))
        angle += scan["angleIncrement"]

    scan["frameId"] = target_frame
    scan["transformApplied"] = True
    scan["points"] = points
    scan["sampledCount"] = len(points)
    return scan


def normalize_subscriptions(namespace, subscriptions):
    namespace = namespace.strip("/")
    normalized = {}

    for topic, message_type in subscriptions.items():
        topic = topic.strip("/")
        if not topic:
            continue

        key_expr = topic if topic.startswith(f"{namespace}/") else f"{namespace}/{topic}"
        normalized[key_expr] = {
            "type": message_type,
            "topic": topic,
        }

    return normalized


def normalize_topics(namespace, topics):
    namespace = namespace.strip("/")
    normalized = []

    for topic in topics:
        topic = topic.strip("/")
        if not topic:
            continue

        key_expr = topic if topic.startswith(f"{namespace}/") else f"{namespace}/{topic}"
        if key_expr not in normalized:
            normalized.append(key_expr)

    return normalized


def encode_twist_payload(command):
    payload = bytearray(52)
    struct.pack_into(">H", payload, 0, 1)
    struct.pack_into(">H", payload, 2, 0)
    offset = CDR_HEADER_SIZE
    values = [
        command.get("linearX", 0),
        command.get("linearY", 0),
        command.get("linearZ", 0),
        command.get("angularX", 0),
        command.get("angularY", 0),
        command.get("angularZ", 0),
    ]

    for value in values:
        if not isinstance(value, (int, float)) or not math.isfinite(value):
            value = 0
        struct.pack_into("<d", payload, offset, value)
        offset += 8

    return bytes(payload)


def encode_empty_payload():
    return b"\x00\x01\x00\x00"


def handle_stdin(command_publisher, actuator_reset_publisher, actuator_reset_key):
    global running

    try:
        for line in sys.stdin:
            if not running:
                break
            if not line.strip():
                continue

            try:
                message = json.loads(line)
            except json.JSONDecodeError:
                emit({"type": "error", "message": "invalid stdin JSON"})
                continue

            if message.get("type") == "cmd_vel":
                try:
                    command_publisher.put(encode_twist_payload(message.get("command") or {}))
                except Exception as error:
                    emit({"type": "error", "message": f"failed to publish cmd_vel: {error}"})
            elif message.get("type") == "actuator_reset":
                try:
                    actuator_reset_publisher.put(encode_empty_payload())
                    emit({"type": "published", "key": actuator_reset_key})
                except Exception as error:
                    emit({"type": "error", "message": f"failed to publish actuators/reset: {error}"})
            elif message.get("type") == "stop":
                running = False
                break
    finally:
        running = False


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", required=True)
    parser.add_argument("--namespace", required=True)
    parser.add_argument("--port", type=int, default=7447)
    parser.add_argument("--parent-pid", type=int, default=0)
    parser.add_argument("--include-scan", action="store_true")
    parser.add_argument("--scan-topic", action="append", default=[])
    parser.add_argument("--tf-topic", action="append", default=[])
    parser.add_argument("--target-frame", action="append", default=[])
    parser.add_argument("--include-map", action="store_true")
    return parser.parse_args()


def build_subscriptions(args):
    subscriptions = dict(BASE_SUBSCRIPTIONS)

    if args.include_scan:
        subscriptions.update(SCAN_SUBSCRIPTIONS)
        scan_topics = args.scan_topic if args.scan_topic else DEFAULT_SCAN_TOPICS
        for topic in scan_topics:
            topic = topic.strip()
            if topic:
                subscriptions[topic] = "laser-scan"

    if args.include_map:
        subscriptions.update(MAP_SUBSCRIPTIONS)

    return normalize_subscriptions(args.namespace, subscriptions)


def main():
    args = parse_args()
    start_parent_monitor(args.parent_pid)
    subscriptions = build_subscriptions(args)
    tf_key_exprs = normalize_topics(args.namespace, args.tf_topic or DEFAULT_TF_TOPICS) if args.include_scan else []
    target_frames = [
        normalize_frame_id(frame)
        for frame in (args.target_frame or DEFAULT_TARGET_FRAMES)
        if normalize_frame_id(frame)
    ]
    command_key = f"{args.namespace.strip('/')}/cmd_vel_collision"
    actuator_reset_key = f"{args.namespace.strip('/')}/actuators/reset"

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
    command_publisher = None
    actuator_reset_publisher = None
    subscribers = []
    last_decode_error_at = {}
    last_tf_decode_error_at = {}
    transform_store = TransformStore()
    urdf_static_transform_count = 0
    urdf_static_error = None

    if args.include_scan:
        try:
            urdf_static_transforms = fetch_urdf_static_transforms(args.host)
            transform_store.update(urdf_static_transforms, True)
            urdf_static_transform_count = len(urdf_static_transforms)
        except (ET.ParseError, OSError, RuntimeError, urllib.error.URLError, json.JSONDecodeError) as error:
            urdf_static_error = str(error)

    def on_sample(sample):
        now = time.monotonic()
        key = str(sample.key_expr)
        subscription = subscriptions.get(key)
        message_type = subscription.get("type") if subscription else None
        payload = sample.payload.to_bytes()

        if message_type in ("battery", "battery2"):
            battery = decode_battery_payload(payload)
            if battery is None:
                emit_decode_error(key, len(payload), now)
                return
            emit({
                "type": message_type,
                "key": key,
                **battery,
            })
            return

        if message_type == "laser-pose":
            pose = decode_pose_payload(payload)
            if pose is None:
                emit_decode_error(key, len(payload), now)
                return
            emit({
                "type": "laser-pose",
                "key": key,
                "pose": pose,
            })
            return

        if message_type == "laser-scan":
            scan = decode_laser_scan_payload(payload)
            if scan is None:
                emit_decode_error(key, len(payload), now)
                return
            scan = apply_tf_to_scan(scan, transform_store, target_frames)
            emit({
                "type": "laser-scan",
                "key": key,
                "topic": subscription.get("topic"),
                "scan": scan,
            })
            return

        if message_type == "compressed-map":
            emit({
                "type": "compressed-map",
                "key": key,
                "byteLength": len(payload),
                "payloadBase64": base64.b64encode(payload).decode("ascii"),
            })
            return

    def emit_decode_error(key, byte_length, now):
        if now - last_decode_error_at.get(key, 0) <= 2:
            return

        emit({
            "type": "decode-error",
            "key": key,
            "byteLength": byte_length,
        })
        last_decode_error_at[key] = now

    def on_tf_sample(sample):
        now = time.monotonic()
        payload = sample.payload.to_bytes()
        key = str(sample.key_expr)
        transforms = decode_tf_payload(payload)
        if transforms is None:
            if now - last_tf_decode_error_at.get(key, 0) > 2:
                emit({
                    "type": "tf-decode-error",
                    "key": key,
                    "byteLength": len(payload),
                })
                last_tf_decode_error_at[key] = now
            return

        transform_store.update(transforms, key.endswith("tf_static"))

    try:
        emit({
            "type": "status",
            "state": "connecting",
            "endpoint": f"tcp/{args.host}:{args.port}",
            "keys": list(subscriptions.keys()),
            "tfKeys": tf_key_exprs,
            "targetFrames": target_frames,
            "urdfStaticTransforms": urdf_static_transform_count,
            "urdfStaticError": urdf_static_error,
            "commandKey": command_key,
            "actuatorResetKey": actuator_reset_key,
        })
        session = zenoh.open(config)
        command_publisher = session.declare_publisher(command_key)
        actuator_reset_publisher = session.declare_publisher(actuator_reset_key)
        subscribers = [session.declare_subscriber(key, on_sample) for key in subscriptions]
        subscribers.extend(session.declare_subscriber(key, on_tf_sample) for key in tf_key_exprs)
        stdin_thread = threading.Thread(target=handle_stdin, args=(command_publisher, actuator_reset_publisher, actuator_reset_key), daemon=True)
        stdin_thread.start()
        emit({
            "type": "status",
            "state": "subscribed",
            "keys": list(subscriptions.keys()),
            "tfKeys": tf_key_exprs,
            "targetFrames": target_frames,
            "urdfStaticTransforms": urdf_static_transform_count,
            "urdfStaticError": urdf_static_error,
            "commandKey": command_key,
            "actuatorResetKey": actuator_reset_key,
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
        if command_publisher is not None:
            try:
                command_publisher.put(encode_twist_payload({}))
                command_publisher.undeclare()
            except Exception:
                pass
        if actuator_reset_publisher is not None:
            try:
                actuator_reset_publisher.undeclare()
            except Exception:
                pass
        for subscriber in subscribers:
            subscriber.undeclare()
        if session is not None:
            session.close()

    return 0


signal.signal(signal.SIGINT, handle_stop)
signal.signal(signal.SIGTERM, handle_stop)

if __name__ == "__main__":
    raise SystemExit(main())
