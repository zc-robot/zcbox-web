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
DEFAULT_FLEET_DATA_TOPICS = ("fleet_data",)

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

    def read_int64(self):
        return self.read("q", 8, 8)

    def read_uint64(self):
        return self.read("Q", 8, 8)

    def read_float64(self):
        return self.read("d", 8, 8)

    def read_string(self):
        length = self.read_uint32()
        if length < 0 or self.offset + length > len(self.payload):
            raise CdrDecodeError("invalid string length")

        value = self.payload[self.offset:self.offset + length]
        self.offset += length
        return value.split(b"\0", 1)[0].decode("utf-8", errors="replace")

    def read_time(self):
        return {
            "sec": self.read_int32(),
            "nanosec": self.read_uint32(),
        }

    def read_header(self):
        return {
            "stamp": self.read_time(),
            "frameId": self.read_string(),
        }

    def read_sequence(self, item_reader, max_count, name):
        count = self.read_uint32()
        if count > max_count:
            raise CdrDecodeError(f"invalid {name} count")
        return [item_reader(self) for _ in range(count)]

    def read_uint32_sequence(self, max_count, name):
        return self.read_sequence(lambda reader: reader.read_uint32(), max_count, name)


def ensure_finite(*values):
    return all(math.isfinite(value) for value in values)


def read_fleet_location(reader):
    location = {
        "map": reader.read_string(),
        "levelName": reader.read_string(),
        "hasPose": reader.read_bool(),
        "x": reader.read_float64(),
        "y": reader.read_float64(),
        "yaw": reader.read_float64(),
    }
    if not ensure_finite(location["x"], location["y"], location["yaw"]):
        raise CdrDecodeError("invalid fleet location")
    return location


def read_fleet_robot_footprint(reader):
    footprint = {
        "isRound": reader.read_bool(),
        "radius": reader.read_float64(),
        "robotLength": reader.read_float64(),
        "robotWidth": reader.read_float64(),
        "navCenterToRobotCenter": reader.read_float64(),
    }
    if not ensure_finite(
        footprint["radius"],
        footprint["robotLength"],
        footprint["robotWidth"],
        footprint["navCenterToRobotCenter"],
    ):
        raise CdrDecodeError("invalid fleet footprint")
    return footprint


def read_fleet_motor_state(reader):
    motor = {
        "id": reader.read_uint32(),
        "name": reader.read_string(),
        "voltage": reader.read_float64(),
        "speed": reader.read_float64(),
        "position": reader.read_float64(),
        "temperature": reader.read_float64(),
        "payload": reader.read_float64(),
        "isEnabled": reader.read_bool(),
        "isPowered": reader.read_bool(),
        "isFaulted": reader.read_bool(),
        "isConnected": reader.read_bool(),
        "errorCode": reader.read_uint32(),
        "errorMessage": reader.read_string(),
    }
    if not ensure_finite(
        motor["voltage"],
        motor["speed"],
        motor["position"],
        motor["temperature"],
        motor["payload"],
    ):
        raise CdrDecodeError("invalid fleet motor state")
    return motor


def read_fleet_wheel_state(reader):
    return {
        "stamp": reader.read_time(),
        "motors": reader.read_sequence(read_fleet_motor_state, 128, "fleet motor"),
    }


def read_key_value(reader):
    return {
        "key": reader.read_string(),
        "value": reader.read_string(),
    }


def read_fleet_diagnostic_status(reader):
    return {
        "level": reader.read_uint8(),
        "name": reader.read_string(),
        "message": reader.read_string(),
        "hardwareId": reader.read_string(),
        "values": reader.read_sequence(read_key_value, 256, "diagnostic key-value"),
    }


def read_fleet_diagnostic_state(reader):
    return {
        "stamp": reader.read_time(),
        "status": reader.read_sequence(read_fleet_diagnostic_status, 128, "diagnostic status"),
    }


def read_fleet_pallet_state(reader):
    return {
        "palletPresent": reader.read_bool(),
        "bufferPresent": reader.read_bool(),
        "palletStock": reader.read_int32(),
        "bufferStock": reader.read_int32(),
        "raw": reader.read_uint32_sequence(256, "pallet raw"),
    }


def read_fleet_robot_data(reader):
    robot = {
        "robot": reader.read_string(),
        "name": reader.read_string(),
        "model": reader.read_string(),
        "ip": reader.read_string(),
        "zenohNamespace": reader.read_string(),
        "status": reader.read_string(),
        "statusDetail": reader.read_string(),
        "lastAttemptTime": reader.read_float64(),
        "retryPeriodSec": reader.read_float64(),
        "mode": reader.read_string(),
        "taskId": reader.read_string(),
        "activityId": reader.read_string(),
        "map": reader.read_string(),
        "location": read_fleet_location(reader),
        "hasFootprint": reader.read_bool(),
        "footprint": read_fleet_robot_footprint(reader),
        "hasBattery": reader.read_bool(),
        "battery": reader.read_float64(),
        "hasBatteryPercent": reader.read_bool(),
        "batteryPercent": reader.read_float64(),
        "hasBatteryCurrent": reader.read_bool(),
        "batteryCurrent": reader.read_float64(),
        "hasWheelState": reader.read_bool(),
        "wheels": read_fleet_wheel_state(reader),
        "hasDiagnostics": reader.read_bool(),
        "diagnostics": read_fleet_diagnostic_state(reader),
        "hasPalletState": reader.read_bool(),
        "palletState": read_fleet_pallet_state(reader),
    }
    if not ensure_finite(
        robot["lastAttemptTime"],
        robot["retryPeriodSec"],
        robot["battery"],
        robot["batteryPercent"],
        robot["batteryCurrent"],
    ):
        raise CdrDecodeError("invalid fleet robot data")
    return robot


def read_fleet_data(reader):
    return {
        "header": reader.read_header(),
        "type": reader.read_string(),
        "name": reader.read_string(),
        "seq": reader.read_uint64(),
        "unixMillisTime": reader.read_int64(),
        "robots": reader.read_sequence(read_fleet_robot_data, 512, "fleet robot"),
        "pendingRobots": reader.read_sequence(read_fleet_robot_data, 512, "pending fleet robot"),
    }


def decode_fleet_data_payload(payload):
    endian = get_cdr_endian(payload)
    if endian is None:
        return None

    for aligned in (True, False):
        for base_offset in (CDR_HEADER_SIZE, 0):
            try:
                return read_fleet_data(CdrReader(payload, endian, aligned, base_offset))
            except (CdrDecodeError, UnicodeDecodeError):
                continue

    return None


def normalize_topics(namespace, topics):
    namespace = namespace.strip("/")
    normalized = []

    for topic in topics:
        raw_topic = topic.strip()
        is_absolute = raw_topic.startswith("/")
        topic = raw_topic.strip("/")
        if not topic:
            continue

        key_expr = topic if is_absolute or not namespace or topic.startswith(f"{namespace}/") else f"{namespace}/{topic}"
        if key_expr not in normalized:
            normalized.append(key_expr)

    return normalized


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", required=True)
    parser.add_argument("--namespace", default="")
    parser.add_argument("--port", type=int, default=7447)
    parser.add_argument("--parent-pid", type=int, default=0)
    parser.add_argument("--topic", action="append", default=[])
    return parser.parse_args()


def main():
    args = parse_args()
    start_parent_monitor(args.parent_pid)
    topics = args.topic if args.topic else DEFAULT_FLEET_DATA_TOPICS
    key_exprs = normalize_topics(args.namespace, topics)

    if not key_exprs:
        emit({"type": "error", "message": "no fleet data topics configured"})
        return 1

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
    last_decode_error_at = {}

    def emit_decode_error(key, byte_length):
        now = time.monotonic()
        if now - last_decode_error_at.get(key, 0) <= 2:
            return

        emit({
            "type": "decode-error",
            "key": key,
            "byteLength": byte_length,
        })
        last_decode_error_at[key] = now

    def on_sample(sample):
        key = str(sample.key_expr)
        payload = sample.payload.to_bytes()
        fleet_data = decode_fleet_data_payload(payload)
        if fleet_data is None:
            emit_decode_error(key, len(payload))
            return

        fleet_type = fleet_data.pop("type", "")
        emit({
            **fleet_data,
            "type": "fleet-data",
            "key": key,
            "fleetType": fleet_type,
        })

    try:
        emit({
            "type": "status",
            "state": "connecting",
            "endpoint": f"tcp/{args.host}:{args.port}",
            "keys": key_exprs,
        })
        session = zenoh.open(config)
        subscribers = [session.declare_subscriber(key, on_sample) for key in key_exprs]
        emit({
            "type": "status",
            "state": "subscribed",
            "keys": key_exprs,
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
