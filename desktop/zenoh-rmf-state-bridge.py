#!/usr/bin/env python3
import argparse
import json
import os
import signal
import struct
import threading
import time


CDR_HEADER_SIZE = 4
DEFAULT_RMF_STATE_TOPICS = ("door_states", "lift_states", "schedule_markers", "storage_state")

running = True
schedule_markers_cache = {}


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

    def read_int32(self):
        return self.read("i", 4, 4)

    def read_uint32(self):
        return self.read("I", 4, 4)

    def read_uint64(self):
        return self.read("Q", 8, 8)

    def read_uint8(self):
        return self.read("B", 1, 1)

    def read_bool(self):
        return bool(self.read_uint8())

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

    def read_time(self):
        return {
            "sec": self.read_int32(),
            "nanosec": self.read_uint32(),
        }

    def read_sequence(self, item_reader, max_count, name):
        count = self.read_uint32()
        if count > max_count:
            raise CdrDecodeError(f"invalid {name} count")
        return [item_reader(self) for _ in range(count)]

    def read_uint8_sequence(self, max_count, name):
        count = self.read_uint32()
        if count > max_count:
            raise CdrDecodeError(f"invalid {name} byte count")
        if self.offset + count > len(self.payload):
            raise CdrDecodeError(f"{name} bytes exceed payload")

        value = self.payload[self.offset:self.offset + count]
        self.offset += count
        return value


def read_door_state(reader):
    return {
        "doorTime": reader.read_time(),
        "doorName": reader.read_string(),
        "currentMode": int(reader.read_uint32()),
    }


def read_lift_state(reader):
    return {
        "liftTime": reader.read_time(),
        "liftName": reader.read_string(),
        "availableFloors": reader.read_sequence(lambda item_reader: item_reader.read_string(), 256, "available floor"),
        "currentFloor": reader.read_string(),
        "destinationFloor": reader.read_string(),
        "doorState": int(reader.read_uint8()),
        "motionState": int(reader.read_uint8()),
        "availableModes": [int(value) for value in reader.read_uint8_sequence(64, "available mode")],
        "currentMode": int(reader.read_uint8()),
        "sessionId": reader.read_string(),
    }


def read_header(reader):
    return {
        "stamp": reader.read_time(),
        "frameId": reader.read_string(),
    }


def read_storage_shelf(reader):
    return {
        "shelfIndex": int(reader.read_uint32()),
        "columns": int(reader.read_uint32()),
        "rows": int(reader.read_uint32()),
        "shelfSide": reader.read_string(),
    }


def read_storage_area(reader):
    return {
        "areaIndex": int(reader.read_uint32()),
        "displayName": reader.read_string(),
        "shelves": reader.read_sequence(read_storage_shelf, 1024, "storage shelf"),
    }


def read_storage_area_legacy(reader):
    return {
        "areaIndex": int(reader.read_uint32()),
        "displayName": "",
        "shelves": reader.read_sequence(read_storage_shelf, 1024, "storage shelf"),
    }


def read_storage_layout(reader, area_reader):
    return {
        "areas": reader.read_sequence(area_reader, 256, "storage area"),
    }


def read_storage_cell_stock(reader):
    return {
        "cellId": reader.read_string(),
        "stock": int(reader.read_int32()),
    }


def read_storage_state(reader, revision_reader, area_reader):
    return {
        "header": read_header(reader),
        "layoutRevision": int(revision_reader(reader)),
        "layout": read_storage_layout(reader, area_reader),
        "cells": reader.read_sequence(read_storage_cell_stock, 200000, "storage cell"),
        "total": int(reader.read_uint32()),
        "disabled": int(reader.read_uint32()),
        "withStock": int(reader.read_uint32()),
    }


def read_point(reader):
    return {
        "x": reader.read_float64(),
        "y": reader.read_float64(),
        "z": reader.read_float64(),
    }


def read_quaternion(reader):
    return {
        "x": reader.read_float64(),
        "y": reader.read_float64(),
        "z": reader.read_float64(),
        "w": reader.read_float64(),
    }


def read_pose(reader):
    position = read_point(reader)
    orientation = read_quaternion(reader)
    return {
        "x": position["x"],
        "y": position["y"],
        "z": position["z"],
        "orientation": orientation,
    }


def read_vector3(reader):
    return {
        "x": reader.read_float64(),
        "y": reader.read_float64(),
        "z": reader.read_float64(),
    }


def read_color(reader):
    return {
        "r": reader.read_float32(),
        "g": reader.read_float32(),
        "b": reader.read_float32(),
        "a": reader.read_float32(),
    }


def read_duration(reader):
    duration = {
        "sec": reader.read_int32(),
        "nanosec": reader.read_uint32(),
    }
    return duration


def duration_to_seconds(duration):
    return float(duration["sec"]) + float(duration["nanosec"]) * 1e-9


def read_compressed_image(reader):
    return {
        "header": read_header(reader),
        "format": reader.read_string(),
        "data": reader.read_uint8_sequence(16 * 1024 * 1024, "compressed image"),
    }


def read_uv_coordinate(reader):
    return {
        "u": reader.read_float32(),
        "v": reader.read_float32(),
    }


def read_mesh_file(reader):
    return {
        "filename": reader.read_string(),
        "data": reader.read_uint8_sequence(16 * 1024 * 1024, "mesh file"),
    }


def read_marker_base(reader):
    header = read_header(reader)
    ns = reader.read_string()
    marker_id = reader.read_int32()
    marker_type = reader.read_int32()
    action = reader.read_int32()
    pose = read_pose(reader)
    scale = read_vector3(reader)
    color = read_color(reader)
    lifetime = read_duration(reader)
    frame_locked = reader.read_bool()
    points = reader.read_sequence(read_point, 8192, "marker point")
    colors = reader.read_sequence(read_color, 8192, "marker color")

    return {
        "frameId": header["frameId"],
        "stamp": header["stamp"],
        "ns": ns,
        "id": int(marker_id),
        "type": int(marker_type),
        "action": int(action),
        "pose": pose,
        "scale": scale,
        "color": color,
        "lifetime": duration_to_seconds(lifetime),
        "frameLocked": frame_locked,
        "points": points,
        "colors": colors,
    }


def read_marker_legacy(reader):
    marker = read_marker_base(reader)
    marker.update({
        "text": reader.read_string(),
        "meshResource": reader.read_string(),
        "meshUseEmbeddedMaterials": reader.read_bool(),
    })
    return marker


def read_marker_modern(reader):
    marker = read_marker_base(reader)
    texture_resource = reader.read_string()
    read_compressed_image(reader)
    reader.read_sequence(read_uv_coordinate, 8192, "marker uv coordinate")
    text = reader.read_string()
    mesh_resource = reader.read_string()
    read_mesh_file(reader)
    mesh_use_embedded_materials = reader.read_bool()

    marker.update({
        "textureResource": texture_resource,
        "text": text,
        "meshResource": mesh_resource,
        "meshUseEmbeddedMaterials": mesh_use_embedded_materials,
    })
    return marker


def read_marker_array(reader, marker_reader):
    return {
        "markers": reader.read_sequence(marker_reader, 2048, "schedule marker"),
    }


def apply_schedule_markers(markers):
    global schedule_markers_cache

    # visualization_msgs/msg/Marker action: 0=ADD/MODIFY, 2=DELETE, 3=DELETEALL.
    for marker in markers:
        ns = marker["ns"]
        marker_id = str(marker["id"])
        action = marker["action"]

        if action == 3:
            schedule_markers_cache = {}
            continue

        if action == 2:
            if ns in schedule_markers_cache and marker_id in schedule_markers_cache[ns]:
                del schedule_markers_cache[ns][marker_id]
                if not schedule_markers_cache[ns]:
                    del schedule_markers_cache[ns]
            continue

        if action != 0:
            continue

        if ns not in schedule_markers_cache:
            schedule_markers_cache[ns] = {}

        schedule_markers_cache[ns][marker_id] = {
            **marker,
            "timestamp": time.time(),
        }

    return schedule_markers_cache


def decode_payload(payload, reader_func, require_complete=False):
    endian = get_cdr_endian(payload)
    if endian is None:
        return None

    for aligned in (True, False):
        for base_offset in (CDR_HEADER_SIZE, 0):
            try:
                reader = CdrReader(payload, endian, aligned, base_offset)
                value = reader_func(reader)
                if require_complete and not is_cdr_payload_complete(payload, reader.offset):
                    raise CdrDecodeError("payload was not fully consumed")
                return value
            except (CdrDecodeError, UnicodeDecodeError):
                continue

    return None


def is_cdr_payload_complete(payload, offset):
    if offset == len(payload):
        return True

    trailing_size = len(payload) - offset
    return 0 < trailing_size <= 7 and all(byte == 0 for byte in payload[offset:])


def decode_marker_array_payload(payload):
    for marker_reader in (read_marker_modern, read_marker_legacy):
        decoded = decode_payload(
            payload,
            lambda reader, marker_reader=marker_reader: read_marker_array(reader, marker_reader),
            True,
        )
        if decoded is not None:
            return decoded

    return None


def decode_storage_state_payload(payload):
    for area_reader in (read_storage_area, read_storage_area_legacy):
        for revision_reader in (lambda reader: reader.read_uint64(), lambda reader: reader.read_uint32()):
            decoded = decode_payload(
                payload,
                lambda reader, revision_reader=revision_reader, area_reader=area_reader: read_storage_state(reader, revision_reader, area_reader),
                True,
            )
            if decoded is not None:
                return decoded

    return None


def normalize_topics(namespace, topics):
    namespace = namespace.strip("/")
    normalized = []

    for topic in topics:
        raw_topic = topic.strip()
        topic = raw_topic.strip("/")
        if not topic:
            continue

        key_expr = topic if not namespace or topic.startswith(f"{namespace}/") else f"{namespace}/{topic}"
        if key_expr not in normalized:
            normalized.append(key_expr)

    return normalized


def get_expected_state_type(key):
    normalized = key.strip("/")
    if normalized.endswith("door_states"):
        return "door-state"
    if normalized.endswith("lift_states"):
        return "lift-state"
    if normalized.endswith("schedule_markers"):
        return "schedule-markers"
    if normalized.endswith("storage_state"):
        return "storage-state"
    return ""


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
    topics = args.topic if args.topic else DEFAULT_RMF_STATE_TOPICS
    key_exprs = normalize_topics(args.namespace, topics)

    if not key_exprs:
        emit({"type": "error", "message": "no RMF state topics configured"})
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

    def emit_decode_error(key, byte_length, expected_type):
        now = time.monotonic()
        if now - last_decode_error_at.get(key, 0) <= 2:
            return

        emit({
            "type": "decode-error",
            "key": key,
            "byteLength": byte_length,
            "expectedType": expected_type,
        })
        last_decode_error_at[key] = now

    def on_sample(sample):
        key = str(sample.key_expr)
        state_type = get_expected_state_type(key)
        if not state_type:
            emit({
                "type": "error",
                "key": key,
                "message": f"unsupported RMF state topic: {key}",
            })
            return

        payload = sample.payload.to_bytes()
        if state_type == "door-state":
            door_state = decode_payload(payload, read_door_state)
            if door_state is None:
                emit_decode_error(key, len(payload), "rmf_door_msgs/msg/DoorState")
                return

            emit({
                **door_state,
                "type": "door-state",
                "key": key,
            })
            return

        if state_type == "schedule-markers":
            marker_array = decode_marker_array_payload(payload)
            if marker_array is None:
                emit_decode_error(key, len(payload), "visualization_msgs/msg/MarkerArray")
                return

            emit({
                "type": "schedule-markers",
                "key": key,
                "markers": apply_schedule_markers(marker_array["markers"]),
            })
            return

        if state_type == "storage-state":
            storage_state = decode_storage_state_payload(payload)
            if storage_state is None:
                emit_decode_error(key, len(payload), "storage_manager/msg/StorageState")
                return

            emit({
                **storage_state,
                "type": "storage-state",
                "key": key,
            })
            return

        lift_state = decode_payload(payload, read_lift_state)
        if lift_state is None:
            emit_decode_error(key, len(payload), "rmf_lift_msgs/msg/LiftState")
            return

        emit({
            **lift_state,
            "type": "lift-state",
            "key": key,
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
