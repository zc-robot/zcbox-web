#!/usr/bin/env python3
import base64
import importlib.util
import pathlib
import struct
import unittest


BRIDGE_PATH = pathlib.Path(__file__).with_name("zenoh-costmap-bridge.py")


def load_bridge():
    spec = importlib.util.spec_from_file_location("zenoh_costmap_bridge", BRIDGE_PATH)
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

    def write_float32(self, value):
        self.write("f", value, 4)

    def write_float64(self, value):
        self.write("d", value, 8)

    def write_string(self, value):
        encoded = value.encode() + b"\0"
        self.write_uint32(len(encoded))
        self.payload.extend(encoded)

    def write_header(self, frame_id="map"):
        self.write_int32(12)
        self.write_uint32(34)
        self.write_string(frame_id)

    def write_pose(self, values):
        for value in values:
            self.write_float64(value)

    def write_int8_sequence(self, values):
        self.write_uint32(len(values))
        self.payload.extend(value & 0xFF for value in values)


class CostmapBridgeTest(unittest.TestCase):
    def test_builds_exact_full_and_update_keys_for_one_layer(self):
        bridge = load_bridge()

        self.assertEqual(bridge.build_costmap_keys("/robot_1/", "global"), [
            "robot_1/global_costmap/costmap",
            "robot_1/global_costmap/costmap_updates",
        ])

    def test_decodes_full_costmap_with_map_geometry_and_cells(self):
        bridge = load_bridge()
        writer = CdrWriter()
        writer.write_header("map")
        writer.write_int32(1)
        writer.write_uint32(2)
        writer.write_float32(0.05)
        writer.write_uint32(3)
        writer.write_uint32(2)
        writer.write_pose([1.5, -2.0, 0.0, 0.0, 0.0, 0.0, 1.0])
        writer.write_int8_sequence([-1, 0, 1, 50, 99, 100])

        decoded = bridge.decode_occupancy_grid_payload(bytes(writer.payload))

        self.assertEqual(decoded["frameId"], "map")
        self.assertEqual(decoded["stamp"], {"sec": 12, "nanosec": 34})
        self.assertEqual(decoded["info"]["width"], 3)
        self.assertEqual(decoded["info"]["height"], 2)
        self.assertAlmostEqual(decoded["info"]["resolution"], 0.05)
        self.assertEqual(decoded["info"]["origin"]["position"], {"x": 1.5, "y": -2.0, "z": 0.0})
        self.assertEqual(decoded["info"]["origin"]["orientation"], {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0})
        self.assertEqual(base64.b64decode(decoded["dataBase64"]), bytes([255, 0, 1, 50, 99, 100]))

    def test_decodes_costmap_update_with_patch_bounds_and_cells(self):
        bridge = load_bridge()
        writer = CdrWriter()
        writer.write_header("map")
        writer.write_uint32(4)
        writer.write_uint32(5)
        writer.write_uint32(2)
        writer.write_uint32(2)
        writer.write_int8_sequence([0, 25, 75, 100])

        decoded = bridge.decode_occupancy_grid_update_payload(bytes(writer.payload))

        self.assertEqual(decoded["frameId"], "map")
        self.assertEqual(decoded["stamp"], {"sec": 12, "nanosec": 34})
        self.assertEqual(decoded["x"], 4)
        self.assertEqual(decoded["y"], 5)
        self.assertEqual(decoded["width"], 2)
        self.assertEqual(decoded["height"], 2)
        self.assertEqual(base64.b64decode(decoded["dataBase64"]), bytes([0, 25, 75, 100]))


if __name__ == "__main__":
    unittest.main()
