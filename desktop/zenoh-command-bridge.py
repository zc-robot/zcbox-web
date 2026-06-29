#!/usr/bin/env python3
import argparse
import json
import math
import os
import signal
import struct
import sys
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


def encode_write_coil_request(address, value):
    payload = bytearray(8)
    struct.pack_into(">H", payload, 0, 1)
    struct.pack_into(">H", payload, 2, 0)
    struct.pack_into("<H", payload, CDR_HEADER_SIZE, int(address) & 0xFFFF)
    struct.pack_into("<?", payload, CDR_HEADER_SIZE + 2, bool(value))
    return bytes(payload)


def decode_write_coil_response(payload):
    if len(payload) < CDR_HEADER_SIZE + 1:
        raise ValueError("write_coil response payload too short")
    return bool(struct.unpack_from("<?", payload, CDR_HEADER_SIZE)[0])


def normalize_key(value):
    return str(value or "").strip().strip("/")


def write_coil(session, message):
    key = normalize_key(message.get("key"))
    request_id = str(message.get("requestId") or "")
    control_id = str(message.get("controlId") or "")
    address = int(message.get("address"))
    value = bool(message.get("value"))

    if not key:
        emit({"type": "error", "message": "missing write_coil service key", "requestId": request_id})
        return

    response_message = {
        "type": "service-response",
        "service": "write_coil",
        "key": key,
        "requestId": request_id,
        "controlId": control_id,
        "address": address,
        "value": value,
        "success": False,
        "message": "no service response",
    }

    try:
        replies = session.get(
            key,
            timeout=3.0,
            payload=encode_write_coil_request(address, value),
        )
        received_reply = False
        for reply in replies:
            received_reply = True
            if reply.ok is not None:
                response_message["success"] = decode_write_coil_response(reply.ok.payload.to_bytes())
                response_message["message"] = "success" if response_message["success"] else "rejected"
                emit(response_message)
                return

            if reply.err is not None:
                response_message["message"] = reply.err.payload.to_bytes().decode("utf-8", errors="replace")
                emit(response_message)
                return

        if not received_reply:
            emit(response_message)
    except Exception as error:
        response_message["message"] = str(error)
        emit(response_message)


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", type=int, default=7447)
    parser.add_argument("--parent-pid", type=int, default=0)
    return parser.parse_args()


def main():
    global running

    args = parse_args()
    start_parent_monitor(args.parent_pid)

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
    publishers = {}

    try:
        emit({
            "type": "status",
            "state": "connecting",
            "endpoint": f"tcp/{args.host}:{args.port}",
        })
        session = zenoh.open(config)
        emit({
            "type": "status",
            "state": "ready",
            "endpoint": f"tcp/{args.host}:{args.port}",
        })

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

            message_type = message.get("type")
            if message_type == "stop":
                running = False
                break
            if message_type == "write_coil":
                write_coil(session, message)
                continue
            if message_type != "twist":
                emit({"type": "error", "message": f"unknown command type: {message_type}"})
                continue

            key = normalize_key(message.get("key"))
            if not key:
                emit({"type": "error", "message": "missing publish key"})
                continue

            try:
                publisher = publishers.get(key)
                if publisher is None:
                    publisher = session.declare_publisher(key)
                    publishers[key] = publisher

                publisher.put(encode_twist_payload(message.get("command") or {}))
                emit({"type": "published", "key": key})
            except Exception as error:
                emit({"type": "error", "key": key, "message": str(error)})
    except Exception as error:
        emit({
            "type": "error",
            "message": str(error),
        })
        return 1
    finally:
        for publisher in publishers.values():
            try:
                publisher.undeclare()
            except Exception:
                pass
        if session is not None:
            session.close()

    return 0


signal.signal(signal.SIGINT, handle_stop)
signal.signal(signal.SIGTERM, handle_stop)

if __name__ == "__main__":
    raise SystemExit(main())
