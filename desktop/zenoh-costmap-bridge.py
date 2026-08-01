#!/usr/bin/env python3
import argparse
import base64
import json
import os
import signal
import struct
import threading
import time


CDR_HEADER_SIZE = 4
SUPPORTED_LAYERS = ("global", "local")
running = True


def emit(message):
    global running
    try:
        print(json.dumps(message, separators=(",", ":")), flush=True)
    except BrokenPipeError:
        running = False


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


def build_costmap_keys(namespace, layer):
    if layer not in SUPPORTED_LAYERS:
        raise ValueError(f"unsupported costmap layer: {layer}")

    normalized_namespace = namespace.strip().strip("/")
    if not normalized_namespace:
        raise ValueError("costmap namespace is required")

    prefix = f"{normalized_namespace}/{layer}_costmap"
    return [f"{prefix}/costmap", f"{prefix}/costmap_updates"]


def should_emit_decode_error(last_error_at, key, now, interval=2):
    previous = last_error_at.get(key)
    if previous is not None and now - previous <= interval:
        return False
    last_error_at[key] = now
    return True


def mark_decode_success(last_error_at):
    last_error_at.clear()


class CdrReader:
    def __init__(self, payload, alignment_base=CDR_HEADER_SIZE):
        self.payload = payload
        self.offset = CDR_HEADER_SIZE
        self.alignment_base = alignment_base
        if len(payload) < CDR_HEADER_SIZE:
            raise ValueError("missing CDR encapsulation")

        encapsulation = struct.unpack_from(">H", payload, 0)[0]
        if encapsulation in (0, 2):
            self.endian = ">"
        elif encapsulation in (1, 3):
            self.endian = "<"
        else:
            raise ValueError("unsupported CDR encapsulation")

    def align(self, alignment):
        remainder = (self.offset - self.alignment_base) % alignment
        if remainder:
            self.offset += alignment - remainder

    def read(self, format_code, alignment):
        self.align(alignment)
        size = struct.calcsize(format_code)
        if self.offset + size > len(self.payload):
            raise ValueError("CDR payload ended early")
        value = struct.unpack_from(f"{self.endian}{format_code}", self.payload, self.offset)[0]
        self.offset += size
        return value

    def read_int32(self):
        return self.read("i", 4)

    def read_uint32(self):
        return self.read("I", 4)

    def read_float32(self):
        return self.read("f", 4)

    def read_float64(self):
        return self.read("d", 8)

    def read_string(self):
        length = self.read_uint32()
        if length <= 0 or self.offset + length > len(self.payload):
            raise ValueError("invalid CDR string")
        raw = self.payload[self.offset:self.offset + length]
        self.offset += length
        if raw[-1] != 0:
            raise ValueError("unterminated CDR string")
        return raw[:-1].decode("utf-8")

    def read_int8_sequence(self):
        length = self.read_uint32()
        if self.offset + length > len(self.payload):
            raise ValueError("invalid CDR int8 sequence")
        data = self.payload[self.offset:self.offset + length]
        self.offset += length
        return data


def read_header(reader):
    stamp = {
        "sec": reader.read_int32(),
        "nanosec": reader.read_uint32(),
    }
    return stamp, reader.read_string()


def read_pose(reader):
    values = [reader.read_float64() for _ in range(7)]
    return {
        "position": {
            "x": values[0],
            "y": values[1],
            "z": values[2],
        },
        "orientation": {
            "x": values[3],
            "y": values[4],
            "z": values[5],
            "w": values[6],
        },
    }


def decode_occupancy_grid_with_alignment(payload, alignment_base):
    reader = CdrReader(payload, alignment_base)
    stamp, frame_id = read_header(reader)
    reader.read_int32()
    reader.read_uint32()
    resolution = reader.read_float32()
    width = reader.read_uint32()
    height = reader.read_uint32()
    origin = read_pose(reader)
    data = reader.read_int8_sequence()

    if not frame_id:
        raise ValueError("OccupancyGrid frame is empty")
    if width <= 0 or height <= 0 or resolution <= 0:
        raise ValueError("OccupancyGrid metadata is invalid")
    if len(data) != width * height:
        raise ValueError("OccupancyGrid data length does not match dimensions")

    return {
        "stamp": stamp,
        "frameId": frame_id,
        "info": {
            "width": width,
            "height": height,
            "resolution": resolution,
            "origin": origin,
        },
        "dataBase64": base64.b64encode(data).decode("ascii"),
    }


def decode_occupancy_grid_payload(payload):
    first_error = None
    for alignment_base in (CDR_HEADER_SIZE, 0):
        try:
            return decode_occupancy_grid_with_alignment(payload, alignment_base)
        except (UnicodeDecodeError, ValueError, struct.error) as error:
            if first_error is None:
                first_error = error
    raise first_error


def decode_occupancy_grid_update_with_alignment(payload, alignment_base):
    reader = CdrReader(payload, alignment_base)
    stamp, frame_id = read_header(reader)
    x = reader.read_uint32()
    y = reader.read_uint32()
    width = reader.read_uint32()
    height = reader.read_uint32()
    data = reader.read_int8_sequence()

    if not frame_id:
        raise ValueError("OccupancyGridUpdate frame is empty")
    if width <= 0 or height <= 0:
        raise ValueError("OccupancyGridUpdate metadata is invalid")
    if len(data) != width * height:
        raise ValueError("OccupancyGridUpdate data length does not match dimensions")

    return {
        "stamp": stamp,
        "frameId": frame_id,
        "x": x,
        "y": y,
        "width": width,
        "height": height,
        "dataBase64": base64.b64encode(data).decode("ascii"),
    }


def decode_occupancy_grid_update_payload(payload):
    first_error = None
    for alignment_base in (CDR_HEADER_SIZE, 0):
        try:
            return decode_occupancy_grid_update_with_alignment(payload, alignment_base)
        except (UnicodeDecodeError, ValueError, struct.error) as error:
            if first_error is None:
                first_error = error
    raise first_error


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", type=int, default=7447)
    parser.add_argument("--namespace", required=True)
    parser.add_argument("--layer", required=True, choices=SUPPORTED_LAYERS)
    parser.add_argument("--parent-pid", type=int, default=0)
    return parser.parse_args()


def main():
    args = parse_args()
    start_parent_monitor(args.parent_pid)
    keys = build_costmap_keys(args.namespace, args.layer)
    full_key, update_key = keys

    try:
        import zenoh
    except Exception as error:
        emit({
            "type": "error",
            "layer": args.layer,
            "message": f"Failed to import eclipse-zenoh: {error}",
        })
        return 1

    config = zenoh.Config()
    config.insert_json5("mode", '"client"')
    config.insert_json5("connect/endpoints", json.dumps([f"tcp/{args.host}:{args.port}"]))
    config.insert_json5("scouting/multicast/enabled", "false")
    config.insert_json5("scouting/gossip/enabled", "false")
    config.insert_json5("transport/shared_memory/enabled", "false")

    session = None
    subscribers = []
    last_decode_error_at = {}

    def on_sample(sample):
        key = str(sample.key_expr)
        payload = sample.payload.to_bytes()
        kind = "update" if key == update_key else "full"

        try:
            decoded = decode_occupancy_grid_update_payload(payload) if kind == "update" else decode_occupancy_grid_payload(payload)
        except (UnicodeDecodeError, ValueError, struct.error) as error:
            now = time.monotonic()
            if should_emit_decode_error(last_decode_error_at, key, now):
                emit({
                    "type": "decode-error",
                    "layer": args.layer,
                    "kind": kind,
                    "key": key,
                    "byteLength": len(payload),
                    "message": str(error),
                })
            return

        mark_decode_success(last_decode_error_at)
        emit({
            "type": "costmap",
            "layer": args.layer,
            "kind": kind,
            "key": key,
            **decoded,
        })

    try:
        emit({
            "type": "status",
            "layer": args.layer,
            "state": "connecting",
            "endpoint": f"tcp/{args.host}:{args.port}",
            "keys": keys,
        })
        session = zenoh.open(config)
        subscribers = [session.declare_subscriber(key, on_sample) for key in keys]
        emit({
            "type": "status",
            "layer": args.layer,
            "state": "subscribed",
            "keys": keys,
        })
        while running:
            time.sleep(0.2)
    except Exception as error:
        emit({
            "type": "error",
            "layer": args.layer,
            "message": str(error),
        })
        return 1
    finally:
        for subscriber in subscribers:
            try:
                subscriber.undeclare()
            except Exception:
                pass
        if session is not None:
            try:
                session.close()
            except Exception:
                pass
    return 0


if __name__ == "__main__":
    signal.signal(signal.SIGINT, handle_stop)
    signal.signal(signal.SIGTERM, handle_stop)
    raise SystemExit(main())
