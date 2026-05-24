#!/usr/bin/env python3
import argparse
import json
import math
import signal
import struct
import time


CDR_HEADER_SIZE = 4
DEFAULT_TOPICS = (
    "depth/points/filtered",
    "depth/points",
    "yolo/detections_pointcloud",
)

POINT_FIELD_DATATYPES = {
    1: ("b", 1),
    2: ("B", 1),
    3: ("h", 2),
    4: ("H", 2),
    5: ("i", 4),
    6: ("I", 4),
    7: ("f", 4),
    8: ("d", 8),
}

running = True


def emit(message):
    print(json.dumps(message, separators=(",", ":")), flush=True)


def handle_stop(_signum, _frame):
    global running
    running = False


def align_cdr_offset(offset, alignment):
    remainder = offset % alignment
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
    def __init__(self, payload, endian, aligned):
        self.payload = payload
        self.endian = endian
        self.aligned = aligned
        self.offset = CDR_HEADER_SIZE

    def align(self, alignment):
        if self.aligned:
            self.offset = align_cdr_offset(self.offset, alignment)

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

    def read_string(self):
        length = self.read_uint32()
        if length < 0 or self.offset + length > len(self.payload):
            raise CdrDecodeError("invalid string length")

        value = self.payload[self.offset:self.offset + length]
        self.offset += length
        return value.split(b"\0", 1)[0].decode("utf-8", errors="replace")

    def read_uint8_sequence(self):
        length = self.read_uint32()
        if self.offset + length > len(self.payload):
            raise CdrDecodeError("invalid uint8 sequence length")

        value = self.payload[self.offset:self.offset + length]
        self.offset += length
        return value


def normalize_topics(namespace, topics):
    namespace = namespace.strip("/")
    normalized = []

    for topic in topics:
        topic = topic.strip("/")
        if not topic:
            continue

        if topic.startswith(f"{namespace}/"):
            key_expr = topic
        else:
            key_expr = f"{namespace}/{topic}"

        if key_expr not in normalized:
            normalized.append(key_expr)

    return normalized


def read_point_value(data, offset, field, endian):
    format_info = POINT_FIELD_DATATYPES.get(field["datatype"])
    if format_info is None:
        return None

    format_code, size = format_info
    value_offset = offset + field["offset"]
    if value_offset + size > len(data):
        return None

    return struct.unpack_from(f"{endian}{format_code}", data, value_offset)[0]


def decode_pointcloud_payload_with_alignment(payload, endian, aligned, max_points):
    reader = CdrReader(payload, endian, aligned)

    stamp_sec = reader.read_int32()
    stamp_nanosec = reader.read_uint32()
    frame_id = reader.read_string()
    height = reader.read_uint32()
    width = reader.read_uint32()

    field_count = reader.read_uint32()
    if field_count <= 0 or field_count > 256:
        raise CdrDecodeError("invalid field count")

    fields = []
    for _ in range(field_count):
        fields.append({
            "name": reader.read_string(),
            "offset": reader.read_uint32(),
            "datatype": reader.read_uint8(),
            "count": reader.read_uint32(),
        })

    is_bigendian = reader.read_bool()
    point_step = reader.read_uint32()
    row_step = reader.read_uint32()
    data = reader.read_uint8_sequence()
    is_dense = reader.read_bool()

    if point_step <= 0 or point_step > 4096:
        raise CdrDecodeError("invalid point step")

    point_count = min(width * height, len(data) // point_step)
    if point_count <= 0:
        raise CdrDecodeError("empty pointcloud")

    fields_by_name = {field["name"].lower(): field for field in fields}
    x_field = fields_by_name.get("x")
    y_field = fields_by_name.get("y")
    z_field = fields_by_name.get("z")
    if x_field is None or y_field is None or z_field is None:
        raise CdrDecodeError("pointcloud is missing x/y/z fields")

    data_endian = ">" if is_bigendian else "<"
    stride = max(1, math.ceil(point_count / max_points))
    points = []

    for index in range(0, point_count, stride):
        offset = index * point_step
        x = read_point_value(data, offset, x_field, data_endian)
        y = read_point_value(data, offset, y_field, data_endian)
        z = read_point_value(data, offset, z_field, data_endian)
        if x is None or y is None or z is None:
            continue
        if not (math.isfinite(x) and math.isfinite(y) and math.isfinite(z)):
            continue

        points.append([x, y, z])

    if not points:
        raise CdrDecodeError("pointcloud has no finite x/y/z points")

    return {
        "frameId": frame_id,
        "stamp": {
            "sec": stamp_sec,
            "nanosec": stamp_nanosec,
        },
        "height": height,
        "width": width,
        "pointStep": point_step,
        "rowStep": row_step,
        "isDense": is_dense,
        "pointCount": point_count,
        "sampledCount": len(points),
        "points": points,
    }


def decode_pointcloud_payload(payload, max_points):
    endian = get_cdr_endian(payload)
    if endian is None:
        return None

    for aligned in (True, False):
        try:
            return decode_pointcloud_payload_with_alignment(payload, endian, aligned, max_points)
        except CdrDecodeError:
            continue

    return None


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", required=True)
    parser.add_argument("--namespace", required=True)
    parser.add_argument("--port", type=int, default=7447)
    parser.add_argument("--topic", action="append", default=[])
    parser.add_argument("--max-points", type=int, default=3500)
    parser.add_argument("--min-interval-ms", type=int, default=250)
    parser.add_argument("--max-samples", type=int, default=0)
    return parser.parse_args()


def main():
    args = parse_args()
    max_points = max(100, min(args.max_points, 20000))
    min_interval = max(0, args.min_interval_ms) / 1000
    key_exprs = normalize_topics(args.namespace, args.topic or DEFAULT_TOPICS)

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
    config.insert_json5("transport/shared_memory/enabled", "false")

    session = None
    subscribers = []
    sample_count = 0
    last_emit_at = 0
    last_decode_error_at = {}

    def on_sample(sample):
        nonlocal sample_count, last_emit_at

        now = time.monotonic()
        if min_interval > 0 and now - last_emit_at < min_interval:
            return

        payload = sample.payload.to_bytes()
        cloud = decode_pointcloud_payload(payload, max_points)
        if cloud is None:
            key = str(sample.key_expr)
            if now - last_decode_error_at.get(key, 0) > 2:
                emit({
                    "type": "decode-error",
                    "key": key,
                    "byteLength": len(payload),
                })
                last_decode_error_at[key] = now
            return

        key = str(sample.key_expr)
        cloud["type"] = "pointcloud"
        cloud["key"] = key
        cloud["topic"] = key
        emit(cloud)
        last_emit_at = now
        sample_count += 1
        if args.max_samples > 0 and sample_count >= args.max_samples:
            handle_stop(None, None)

    try:
        emit({
            "type": "status",
            "state": "connecting",
            "endpoint": f"tcp/{args.host}:{args.port}",
            "keys": key_exprs,
        })
        session = zenoh.open(config)
        subscribers = [session.declare_subscriber(key_expr, on_sample) for key_expr in key_exprs]
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
