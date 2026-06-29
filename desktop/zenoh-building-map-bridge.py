#!/usr/bin/env python3
import argparse
import base64
import json
import math
import os
import signal
import struct
import threading
import time


CDR_HEADER_SIZE = 4
DEFAULT_BUILDING_MAP_TOPICS = ("/map",)

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


def ensure_finite(*values):
    return all(math.isfinite(value) for value in values)


def get_png_size(data):
    if len(data) < 24:
        return None
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        return None

    return {
        "width": struct.unpack_from(">I", data, 16)[0],
        "height": struct.unpack_from(">I", data, 20)[0],
    }


def read_param(reader):
    name = reader.read_string()
    param_type = reader.read_uint32()
    value_int = reader.read_int32()
    value_float = reader.read_float32()
    param = {
        "name": name,
        "type": int(param_type),
        "valueInt": int(value_int),
        "valueFloat": float(value_float),
        "valueString": reader.read_string(),
        "valueBool": reader.read_bool(),
    }
    if not ensure_finite(param["valueFloat"]):
        raise CdrDecodeError("invalid param float")
    return param


def read_graph_node(reader):
    node = {
        "x": float(reader.read_float32()),
        "y": float(reader.read_float32()),
        "name": reader.read_string(),
        "params": reader.read_sequence(read_param, 512, "node param"),
    }
    if not ensure_finite(node["x"], node["y"]):
        raise CdrDecodeError("invalid graph node")
    return node


def read_graph_edge(reader):
    edge = {
        "v1": int(reader.read_uint32()),
        "v2": int(reader.read_uint32()),
        "params": reader.read_sequence(read_param, 512, "edge param"),
        "type": int(reader.read_uint8()),
    }
    return edge


def read_graph(reader, graph_type):
    return {
        "name": reader.read_string(),
        "type": graph_type,
        "vertices": reader.read_sequence(read_graph_node, 20000, "graph vertex"),
        "edges": reader.read_sequence(read_graph_edge, 40000, "graph edge"),
        "params": reader.read_sequence(read_param, 512, "graph param"),
    }


def read_map_image(reader):
    name = reader.read_string()
    x_offset = reader.read_float32()
    y_offset = reader.read_float32()
    yaw = reader.read_float32()
    scale = reader.read_float32()
    encoding = reader.read_string()
    data = reader.read_uint8_sequence(50 * 1024 * 1024, "map image")
    image = {
        "name": name,
        "xOffset": float(x_offset),
        "yOffset": float(y_offset),
        "yaw": float(yaw),
        "scale": float(scale),
        "encoding": encoding,
        "dataBase64": base64.b64encode(data).decode("ascii"),
        "dataLength": len(data),
    }
    if not ensure_finite(image["xOffset"], image["yOffset"], image["yaw"], image["scale"]):
        raise CdrDecodeError("invalid map image transform")

    size = get_png_size(data)
    if size:
        image.update(size)

    return image


def read_place(reader):
    place = {
        "name": reader.read_string(),
        "x": float(reader.read_float32()),
        "y": float(reader.read_float32()),
        "yaw": float(reader.read_float32()),
        "positionTolerance": float(reader.read_float32()),
        "yawTolerance": float(reader.read_float32()),
    }
    if not ensure_finite(place["x"], place["y"], place["yaw"], place["positionTolerance"], place["yawTolerance"]):
        raise CdrDecodeError("invalid place")
    return place


def read_door(reader):
    door = {
        "name": reader.read_string(),
        "v1X": float(reader.read_float32()),
        "v1Y": float(reader.read_float32()),
        "v2X": float(reader.read_float32()),
        "v2Y": float(reader.read_float32()),
        "doorType": int(reader.read_uint8()),
        "motionRange": float(reader.read_float32()),
        "motionDirection": int(reader.read_int32()),
    }
    if not ensure_finite(door["v1X"], door["v1Y"], door["v2X"], door["v2Y"], door["motionRange"]):
        raise CdrDecodeError("invalid door")
    return door


def read_level(reader):
    level = {
        "name": reader.read_string(),
        "elevation": float(reader.read_float32()),
        "images": reader.read_sequence(read_map_image, 64, "level image"),
        "places": reader.read_sequence(read_place, 20000, "level place"),
        "doors": reader.read_sequence(read_door, 4096, "level door"),
        "graphs": [],
    }
    if not ensure_finite(level["elevation"]):
        raise CdrDecodeError("invalid level elevation")

    nav_graphs = reader.read_sequence(lambda r: read_graph(r, "nav"), 128, "nav graph")
    wall_graph = read_graph(reader, "wall")
    level["graphs"] = nav_graphs + [wall_graph]
    return level


def read_lift(reader):
    lift = {
        "name": reader.read_string(),
        "levels": reader.read_sequence(lambda r: r.read_string(), 256, "lift level"),
        "doors": reader.read_sequence(read_door, 1024, "lift door"),
        "wallGraph": read_graph(reader, "wall"),
        "refX": float(reader.read_float32()),
        "refY": float(reader.read_float32()),
        "refYaw": float(reader.read_float32()),
        "width": float(reader.read_float32()),
        "depth": float(reader.read_float32()),
    }
    if not ensure_finite(lift["refX"], lift["refY"], lift["refYaw"], lift["width"], lift["depth"]):
        raise CdrDecodeError("invalid lift")
    return lift


def read_building_map(reader):
    return {
        "name": reader.read_string(),
        "levels": reader.read_sequence(read_level, 256, "level"),
        "lifts": reader.read_sequence(read_lift, 2048, "lift"),
    }


def decode_building_map_payload(payload):
    endian = get_cdr_endian(payload)
    if endian is None:
        return None, "invalid CDR endian header"

    last_error = ""
    for aligned in (True, False):
        for base_offset in (CDR_HEADER_SIZE, 0):
            try:
                return read_building_map(CdrReader(payload, endian, aligned, base_offset)), ""
            except (CdrDecodeError, UnicodeDecodeError, struct.error) as error:
                last_error = f"{type(error).__name__}: {error}"
                continue

    return None, last_error or "unknown decode failure"


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
    topics = args.topic if args.topic else DEFAULT_BUILDING_MAP_TOPICS
    key_exprs = normalize_topics(args.namespace, topics)

    if not key_exprs:
        emit({"type": "error", "message": "no building map topics configured"})
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

    def emit_decode_error(key, byte_length, detail):
        now = time.monotonic()
        if now - last_decode_error_at.get(key, 0) <= 2:
            return

        emit({
            "type": "decode-error",
            "key": key,
            "byteLength": byte_length,
            "message": f"failed to decode rmf_building_map_msgs/BuildingMap: {detail}",
        })
        last_decode_error_at[key] = now

    def on_sample(sample):
        key = str(sample.key_expr)
        payload = sample.payload.to_bytes()
        building_map, decode_error = decode_building_map_payload(payload)
        if building_map is None:
            emit_decode_error(key, len(payload), decode_error)
            return

        emit({
            **building_map,
            "type": "building-map",
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
