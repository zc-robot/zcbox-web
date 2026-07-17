#!/usr/bin/env python3
import importlib.util
import pathlib
import struct
import unittest


BRIDGE_PATH = pathlib.Path(__file__).with_name("zenoh-bond-bridge.py")


def load_bridge():
    spec = importlib.util.spec_from_file_location("zenoh_bond_bridge", BRIDGE_PATH)
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

    def write_int32(self, value):
        self.write("i", value, 4)

    def write_uint32(self, value):
        self.write("I", value, 4)

    def write_bool(self, value):
        self.write("?", value, 1)

    def write_float64(self, value):
        self.write("d", value, 8)

    def write_float32(self, value):
        self.write("f", value, 4)

    def write_string(self, value):
        encoded = value.encode() + b"\0"
        self.write_uint32(len(encoded))
        self.payload.extend(encoded)


class BondBridgeTest(unittest.TestCase):
    def test_decodes_captured_robot_bond_status(self):
        bridge = load_bridge()
        payload = bytes.fromhex(
            "000100006a7f09006280270c010000000000000012000000"
            "636f6e74726f6c6c65725f73657276657200000025000000"
            "62316636303438372d333564362d343661312d616634302d"
            "63633430663965663036656300010000f902155020bcbe4c"
        )

        status = bridge.decode_bond_status_payload(payload)

        self.assertIsNotNone(status)
        self.assertEqual(status["id"], "controller_server")
        self.assertEqual(status["instanceId"], "b1f60487-35d6-46a1-af40-cc40f9ef06ec")
        self.assertTrue(status["active"])
        self.assertAlmostEqual(status["heartbeatTimeout"], 10_000_000_000.0, delta=1024)
        self.assertAlmostEqual(status["heartbeatPeriod"], 100_000_000.0, delta=16)

    def test_decodes_bond_status(self):
        bridge = load_bridge()
        writer = CdrWriter()
        writer.write_int32(621144)
        writer.write_uint32(576033451)
        writer.write_string("")
        writer.write_string("behavior_server")
        writer.write_string("0837edbb-89c0-43fa-9076-b182a4299004")
        writer.write_bool(True)
        writer.write_float32(10_000_000_000.0)
        writer.write_float32(100_000_000.0)

        status = bridge.decode_bond_status_payload(bytes(writer.payload))

        self.assertEqual(status["header"]["stamp"], {"sec": 621144, "nanosec": 576033451})
        self.assertEqual(status["id"], "behavior_server")
        self.assertEqual(status["instanceId"], "0837edbb-89c0-43fa-9076-b182a4299004")
        self.assertTrue(status["active"])
        self.assertEqual(status["heartbeatTimeout"], 10_000_000_000.0)
        self.assertEqual(status["heartbeatPeriod"], 100_000_000.0)

    def test_extracts_robot_namespace_from_bond_key(self):
        bridge = load_bridge()
        self.assertEqual(bridge.parse_namespace("robot_1/bond"), "robot_1")


if __name__ == "__main__":
    unittest.main()
