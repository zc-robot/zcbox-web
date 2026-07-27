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


def write_current_task_info(writer, status="RECOVERY_REQUIRED"):
    writer.write_string("task-1")
    writer.write_string("recoverable_delivery")
    writer.write_string("Delivery with linked recovery")
    writer.write_string("cleaner")
    writer.write_string("nest")
    writer.write_string(status)
    write_int64(writer, 1000)
    write_int64(writer, 2000)
    writer.write_string("task-definition-1")
    writer.write_string("task-execution-1")
    writer.write_string("task-execution-1")
    write_int64(writer, 1100)
    write_int64(writer, 2100)


def write_recovery_lifecycle_action(writer, action_name, parameters_json, failure_policy):
    writer.write_string(action_name)
    writer.write_string(parameters_json)
    writer.write_string(failure_policy)


def write_current_unit_task_info(writer):
    writer.write_string("unit-1")
    writer.write_int32(2)
    writer.write_string("P1")
    writer.write_string("perform_plc_task")
    writer.write_string("RECOVERY_REQUIRED")
    writer.write_int32(1)
    writer.write_string("recover_task=1")
    writer.write_string("task-definition-1")
    writer.write_string("task-execution-1")
    writer.write_string("unit-definition-1")
    writer.write_string("unit-execution-1")
    writer.write_string("via_waypoint_and_pause_pose")
    writer.write_string("C1")
    writer.write_float64(0.15)
    writer.write_bool(True)
    writer.write_float64(0.25)
    writer.write_int32(4)
    writer.write_float64(240.0)
    writer.write_uint32(1)
    write_recovery_lifecycle_action(writer, "stop_tool", "{\"tool\":\"brush\"}", "required")
    writer.write_uint32(1)
    write_recovery_lifecycle_action(writer, "start_tool", "{\"tool\":\"brush\"}", "best_effort")


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
    def test_create_task_request_encodes_current_simple_and_unit_task_fields(self):
        bridge = load_bridge()
        payload = bridge.encode_create_task_request({
            "name": "inspect_pose",
            "description": "Inspect the selected waypoint",
            "robot_name": "cleaner",
            "fleet_name": "fleet",
            "waypoint": "P1",
            "action_name": "go_to_pose",
            "parameters_json": "{\"x\":1.0}",
            "unit_tasks": [{
                "seq": 2,
                "waypoint": "",
                "action_name": "perform_plc_task",
                "action_params_json": "{\"task_index\":3}",
                "recovery_resume_mode": "via_waypoint",
                "recovery_approach_waypoint": "C1",
                "recovery_position_tolerance_m": 0.2,
                "recovery_yaw_tolerance_enabled": True,
                "recovery_yaw_tolerance_rad": 0.3,
                "recovery_max_attempts": 5,
                "recovery_clear_timeout_sec": 180.0,
                "on_suspend_actions": [{
                    "action_name": "stop_tool",
                    "parameters_json": "{\"tool\":\"brush\"}",
                    "failure_policy": "required",
                }],
                "before_redispatch_actions": [{
                    "action_name": "start_tool",
                    "parameters_json": "{\"tool\":\"brush\"}",
                    "failure_policy": "best_effort",
                }],
            }],
            "recovery_task_mappings": [{
                "recovery_task_index": 1,
                "recovery_task_definition_id": "recovery-definition-1",
            }],
        })
        reader = bridge.CdrReader(payload)

        self.assertEqual(reader.read_string(), "inspect_pose")
        self.assertEqual(reader.read_string(), "Inspect the selected waypoint")
        self.assertEqual(reader.read_string(), "cleaner")
        self.assertEqual(reader.read_string(), "fleet")
        self.assertEqual(reader.read_string(), "P1")
        self.assertEqual(reader.read_string(), "go_to_pose")
        self.assertEqual(reader.read_string(), "{\"x\":1.0}")
        self.assertEqual(reader.read_uint32(), 1)
        self.assertEqual(reader.read_int32(), 2)
        self.assertEqual(reader.read_string(), "")
        self.assertEqual(reader.read_string(), "perform_plc_task")
        self.assertEqual(reader.read_string(), "{\"task_index\":3}")
        self.assertEqual(reader.read_string(), "via_waypoint")
        self.assertEqual(reader.read_string(), "C1")
        self.assertAlmostEqual(reader.read_float64(), 0.2)
        self.assertTrue(reader.read_bool())
        self.assertAlmostEqual(reader.read_float64(), 0.3)
        self.assertEqual(reader.read_int32(), 5)
        self.assertAlmostEqual(reader.read_float64(), 180.0)
        self.assertEqual(reader.read_uint32(), 1)
        self.assertEqual(reader.read_string(), "stop_tool")
        self.assertEqual(reader.read_string(), "{\"tool\":\"brush\"}")
        self.assertEqual(reader.read_string(), "required")
        self.assertEqual(reader.read_uint32(), 1)
        self.assertEqual(reader.read_string(), "start_tool")
        self.assertEqual(reader.read_string(), "{\"tool\":\"brush\"}")
        self.assertEqual(reader.read_string(), "best_effort")
        self.assertEqual(reader.read_uint32(), 1)
        self.assertEqual(reader.read_uint8(), 1)
        self.assertEqual(reader.read_string(), "recovery-definition-1")

    def test_list_actions_response_decodes_action_catalog(self):
        bridge = load_bridge()
        writer = bridge.CdrWriter()
        writer.write_bool(True)
        writer.write_uint32(2)
        writer.write_string("go_to_pose")
        writer.write_uint32(2)
        writer.write_string("map_name")
        writer.write_string("string")
        writer.write_string("x")
        writer.write_string("double")
        writer.write_string("perform_plc_task")
        writer.write_uint32(1)
        writer.write_string("task_index")
        writer.write_string("int")
        writer.write_string("loaded")

        response = bridge.decode_list_actions_response(writer.to_bytes())

        self.assertTrue(response["ok"])
        self.assertEqual(response["message"], "loaded")
        self.assertEqual(len(response["actions"]), 2)
        self.assertEqual(response["actions"][0]["action_name"], "go_to_pose")
        self.assertEqual(response["actions"][0]["required_parameters"][1]["name"], "x")
        self.assertEqual(response["actions"][1]["required_parameters"][0]["data_type"], "int")

    def test_list_actions_response_allows_trailing_cdr_padding(self):
        bridge = load_bridge()
        writer = bridge.CdrWriter()
        writer.write_bool(True)
        writer.write_uint32(1)
        writer.write_string("perform_plc_task")
        writer.write_uint32(1)
        writer.write_string("timeout")
        writer.write_string("double")
        writer.write_string("")
        payload = writer.to_bytes() + b"\0\0\0"

        response = bridge.decode_list_actions_response(payload)

        self.assertTrue(response["ok"])
        self.assertEqual(response["actions"][0]["action_name"], "perform_plc_task")
        self.assertEqual(response["actions"][0]["required_parameters"][0]["name"], "timeout")

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

    def test_list_tasks_decodes_current_task_info(self):
        bridge = load_bridge()
        writer = bridge.CdrWriter()
        writer.write_uint32(1)
        write_current_task_info(writer)

        tasks = bridge.decode_list_tasks_response(writer.to_bytes())

        self.assertEqual(tasks[0]["status"], "RECOVERY_REQUIRED")
        self.assertEqual(tasks[0]["description"], "Delivery with linked recovery")
        self.assertEqual(tasks[0]["task_definition_id"], "task-definition-1")
        self.assertEqual(tasks[0]["execution_updated_at_unix_ms"], 2100)

    def test_get_task_decodes_recovery_fields_and_mappings(self):
        bridge = load_bridge()
        writer = bridge.CdrWriter()
        writer.write_bool(True)
        write_current_task_info(writer)
        writer.write_uint32(1)
        write_current_unit_task_info(writer)
        writer.write_uint32(1)
        writer.write_uint8(7)
        writer.write_string("recovery-definition-7")
        writer.write_string("found")

        detail = bridge.decode_get_task_response(writer.to_bytes())

        self.assertTrue(detail["found"])
        self.assertEqual(detail["message"], "found")
        self.assertEqual(detail["unit_tasks"][0]["recovery_resume_mode"], "via_waypoint_and_pause_pose")
        self.assertEqual(detail["unit_tasks"][0]["recovery_max_attempts"], 4)
        self.assertEqual(detail["unit_tasks"][0]["on_suspend_actions"][0]["action_name"], "stop_tool")
        self.assertEqual(
            detail["unit_tasks"][0]["before_redispatch_actions"][0]["failure_policy"],
            "best_effort",
        )
        self.assertEqual(detail["recovery_task_mappings"][0]["recovery_task_index"], 7)
        self.assertEqual(
            detail["recovery_task_mappings"][0]["recovery_task_definition_id"],
            "recovery-definition-7",
        )

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
