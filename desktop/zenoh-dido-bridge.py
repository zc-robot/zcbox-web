#!/usr/bin/env python3
import argparse
import json
import os
import signal
import struct
import threading
import time


CDR_HEADER_SIZE = 4
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

    def read_uint8(self):
        return self.read("B", 1, 1)

    def read_uint32(self):
        return self.read("I", 4, 4)

    def read_string(self):
        length = self.read_uint32()
        if length < 0 or self.offset + length > len(self.payload):
            raise CdrDecodeError("invalid string length")

        value = self.payload[self.offset:self.offset + length]
        self.offset += length
        return value.split(b"\0", 1)[0].decode("utf-8", errors="replace")

    def read_uint8_sequence(self, max_count, name):
        count = self.read_uint32()
        if count > max_count:
            raise CdrDecodeError(f"invalid {name} count")
        if self.offset + count > len(self.payload):
            raise CdrDecodeError(f"payload ended before {name}")

        values = list(self.payload[self.offset:self.offset + count])
        self.offset += count
        return values


def read_multi_array_dimension(reader):
    return {
        "label": reader.read_string(),
        "size": reader.read_uint32(),
        "stride": reader.read_uint32(),
    }


def decode_uint8_multi_array_payload(payload):
    endian = get_cdr_endian(payload)
    if endian is None:
        return None

    for aligned in (True, False):
        for base_offset in (CDR_HEADER_SIZE, 0):
            try:
                reader = CdrReader(payload, endian, aligned, base_offset)
                dim_count = reader.read_uint32()
                if dim_count > 64:
                    raise CdrDecodeError("invalid layout dimension count")

                dim = [read_multi_array_dimension(reader) for _ in range(dim_count)]
                data_offset = reader.read_uint32()
                data = reader.read_uint8_sequence(4096, "data")
                bits = [
                    {
                        "index": byte_index * 8 + bit_index,
                        "byteIndex": byte_index,
                        "bitIndex": bit_index,
                        "value": bool(byte_value & (1 << bit_index)),
                    }
                    for byte_index, byte_value in enumerate(data)
                    for bit_index in range(8)
                ]

                return {
                    "layout": {
                        "dim": dim,
                        "dataOffset": data_offset,
                    },
                    "data": data,
                    "bits": bits,
                }
            except (CdrDecodeError, UnicodeDecodeError):
                continue

    return None


def normalize_topics(topics):
    normalized = []
    for topic in topics:
        key_expr = topic.strip("/")
        if key_expr and key_expr not in normalized:
            normalized.append(key_expr)
    return normalized


def parse_topic_key(key):
    normalized = key.strip("/")
    if normalized.endswith("/dido/di"):
        return normalized[:-len("/dido/di")], "di"
    if normalized.endswith("/dido/do"):
        return normalized[:-len("/dido/do")], "do"
    return "", "unknown"


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", type=int, default=7447)
    parser.add_argument("--parent-pid", type=int, default=0)
    parser.add_argument("--topic", action="append", default=[])
    return parser.parse_args()


def main():
    args = parse_args()
    start_parent_monitor(args.parent_pid)
    key_exprs = normalize_topics(args.topic)

    if not key_exprs:
        emit({"type": "error", "message": "no DIDO topics configured"})
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
        message = decode_uint8_multi_array_payload(payload)
        if message is None:
            emit_decode_error(key, len(payload))
            return

        namespace, channel = parse_topic_key(key)
        emit({
            "type": "dido",
            "key": key,
            "namespace": namespace,
            "channel": channel,
            **message,
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
