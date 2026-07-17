#!/usr/bin/env python3
import importlib.util
import pathlib
import struct
import unittest


BRIDGE_PATH = pathlib.Path(__file__).with_name("zenoh-command-bridge.py")


def load_bridge():
    spec = importlib.util.spec_from_file_location("zenoh_command_bridge", BRIDGE_PATH)
    bridge = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bridge)
    return bridge


def write_int64(writer, value):
    writer.align(8)
    writer.payload.extend(struct.pack("<q", int(value)))


def write_pointcloud_response(writer):
    writer.write_bool(True)
    writer.write_string("success")
    writer.write_int32(12)
    writer.write_uint32(34)
    writer.write_string("base_footprint")
    writer.write_uint32(1)
    writer.write_uint32(2)
    writer.write_uint32(3)
    for name, offset in (("x", 0), ("y", 4), ("z", 8)):
        writer.write_string(name)
        writer.write_uint32(offset)
        writer.write_uint8(7)
        writer.write_uint32(1)
    writer.write_bool(False)
    writer.write_uint32(12)
    writer.write_uint32(24)
    data = struct.pack("<ffffff", 1.0, 2.0, 3.0, 4.0, 5.0, 6.0)
    writer.write_uint32(len(data))
    writer.payload.extend(data)
    writer.write_bool(True)


class TaskInfoDecoderTest(unittest.TestCase):
    def test_list_tasks_decodes_archived_task_status(self):
        bridge = load_bridge()
        writer = bridge.CdrWriter()
        writer.write_uint32(1)
        writer.write_string("task-1")
        writer.write_string("go_to_waypoints")
        writer.write_string("cleaner")
        writer.write_string("nest")
        writer.write_string("ARCHIVED")
        write_int64(writer, 1000)
        write_int64(writer, 2000)
        writer.write_string("task-definition-1")
        writer.write_string("task-execution-1")
        writer.write_string("")
        write_int64(writer, 1000)
        write_int64(writer, 2000)

        tasks = bridge.decode_list_tasks_response(writer.to_bytes())

        self.assertEqual(len(tasks), 1)
        self.assertEqual(tasks[0]["status"], "ARCHIVED")
        self.assertEqual(tasks[0]["task_definition_id"], "task-definition-1")

    def test_point_cloud_roi_request_encodes_service_fields(self):
        bridge = load_bridge()
        payload = bridge.encode_point_cloud_roi_request({
            "min_x": 0.1,
            "max_x": 2.5,
            "min_y": -0.4,
            "max_y": 0.4,
            "min_z": -0.1,
            "max_z": 1.2,
            "remove_ground": True,
            "ground_plane_a": 0.0,
            "ground_plane_b": 0.0,
            "ground_plane_c": 1.0,
            "ground_plane_d": -0.02,
            "ground_distance_threshold": 0.08,
        })
        reader = bridge.CdrReader(payload)

        self.assertAlmostEqual(reader.read_float64(), 0.1)
        self.assertAlmostEqual(reader.read_float64(), 2.5)
        self.assertAlmostEqual(reader.read_float64(), -0.4)
        self.assertAlmostEqual(reader.read_float64(), 0.4)
        self.assertAlmostEqual(reader.read_float64(), -0.1)
        self.assertAlmostEqual(reader.read_float64(), 1.2)
        self.assertTrue(reader.read_bool())
        self.assertAlmostEqual(reader.read_float64(), 0.0)
        self.assertAlmostEqual(reader.read_float64(), 0.0)
        self.assertAlmostEqual(reader.read_float64(), 1.0)
        self.assertAlmostEqual(reader.read_float64(), -0.02)
        self.assertAlmostEqual(reader.read_float64(), 0.08)

    def test_point_cloud_roi_response_decodes_pointcloud2(self):
        bridge = load_bridge()
        writer = bridge.CdrWriter()
        write_pointcloud_response(writer)

        response = bridge.decode_point_cloud_roi_response(writer.to_bytes(), 100)

        self.assertTrue(response["success"])
        self.assertEqual(response["message"], "success")
        self.assertEqual(response["pointCloud"]["frameId"], "base_footprint")
        self.assertEqual(response["pointCloud"]["width"], 2)
        self.assertEqual(response["pointCloud"]["pointCount"], 2)
        self.assertEqual(response["pointCloud"]["sampledCount"], 2)
        self.assertEqual(response["pointCloud"]["points"][0], [1.0, 2.0, 3.0])
        self.assertEqual(response["pointCloud"]["points"][1], [4.0, 5.0, 6.0])

    def test_point_cloud_roi_response_allows_empty_pointcloud2(self):
        bridge = load_bridge()
        writer = bridge.CdrWriter()
        writer.write_bool(False)
        writer.write_string("outside roi")
        writer.write_int32(0)
        writer.write_uint32(0)
        writer.write_string("base_footprint")
        writer.write_uint32(0)
        writer.write_uint32(0)
        writer.write_uint32(0)
        writer.write_bool(False)
        writer.write_uint32(0)
        writer.write_uint32(0)
        writer.write_uint32(0)
        writer.write_bool(True)

        response = bridge.decode_point_cloud_roi_response(writer.to_bytes(), 100)

        self.assertFalse(response["success"])
        self.assertEqual(response["message"], "outside roi")
        self.assertEqual(response["pointCloud"]["pointCount"], 0)
        self.assertEqual(response["pointCloud"]["points"], [])


if __name__ == "__main__":
    unittest.main()
