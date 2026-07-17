#!/usr/bin/env python3
import importlib.util
import pathlib
import struct
import unittest


BRIDGE_PATH = pathlib.Path(__file__).with_name("zenoh-lifecycle-transition-bridge.py")


def load_bridge():
    spec = importlib.util.spec_from_file_location("zenoh_lifecycle_transition_bridge", BRIDGE_PATH)
    bridge = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bridge)
    return bridge


class CdrWriter:
    def __init__(self):
        self.payload = bytearray(b"\x00\x01\x00\x00")

    def align(self, alignment):
        while (len(self.payload) - 4) % alignment:
            self.payload.append(0)

    def write(self, format_code, value, alignment):
        self.align(alignment)
        self.payload.extend(struct.pack(f"<{format_code}", value))

    def write_uint8(self, value):
        self.write("B", value, 1)

    def write_int32(self, value):
        self.write("i", value, 4)

    def write_uint32(self, value):
        self.write("I", value, 4)

    def write_string(self, value):
        encoded = value.encode() + b"\0"
        self.write_uint32(len(encoded))
        self.payload.extend(encoded)

    def write_state(self, state_id, label):
        self.write_uint8(state_id)
        self.write_string(label)


class LifecycleTransitionBridgeTest(unittest.TestCase):
    def test_decodes_transition_event(self):
        bridge = load_bridge()
        writer = CdrWriter()
        writer.write_int32(12)
        writer.write_uint32(34)
        writer.write_state(3, "activate")
        writer.write_state(2, "inactive")
        writer.write_state(3, "active")

        event = bridge.decode_transition_event_payload(bytes(writer.payload))

        self.assertEqual(event["stamp"], {"sec": 12, "nanosec": 34})
        self.assertEqual(event["transition"], {"id": 3, "label": "activate"})
        self.assertEqual(event["startState"], {"id": 2, "label": "inactive"})
        self.assertEqual(event["goalState"], {"id": 3, "label": "active"})

    def test_prefixes_topics_with_robot_namespace(self):
        bridge = load_bridge()
        topics = bridge.normalize_topics("nest_123", ["/amcl/transition_event", "nest_123/map_server/transition_event"])
        self.assertEqual(topics, ["nest_123/amcl/transition_event", "nest_123/map_server/transition_event"])


if __name__ == "__main__":
    unittest.main()
