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
TASK_STATUSES = {
    "CREATED",
    "PENDING",
    "RUNNING",
    "SUCCEEDED",
    "FAILED",
    "CANCELED",
    "SKIPPED",
    "PAUSED",
    "RECOVERY_REQUIRED",
    "ARCHIVED",
}
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


class CdrWriter:
    def __init__(self):
        self.payload = bytearray()
        self.payload.extend(b"\x00\x01\x00\x00")

    def align(self, alignment):
        remainder = (len(self.payload) - CDR_HEADER_SIZE) % alignment
        if remainder:
            self.payload.extend(b"\0" * (alignment - remainder))

    def write_int32(self, value):
        self.align(4)
        self.payload.extend(struct.pack("<i", int(value)))

    def write_uint32(self, value):
        self.align(4)
        self.payload.extend(struct.pack("<I", int(value) & 0xFFFFFFFF))

    def write_uint64(self, value):
        self.align(8)
        self.payload.extend(struct.pack("<Q", int(value) & 0xFFFFFFFFFFFFFFFF))

    def write_uint8(self, value):
        self.payload.extend(struct.pack("<B", int(value) & 0xFF))

    def write_bool(self, value):
        self.payload.extend(struct.pack("<?", bool(value)))

    def write_float64(self, value):
        self.align(8)
        self.payload.extend(struct.pack("<d", float(value)))

    def write_string(self, value):
        encoded = str(value or "").encode("utf-8") + b"\0"
        self.write_uint32(len(encoded))
        self.payload.extend(encoded)

    def to_bytes(self):
        return bytes(self.payload)


class CdrReader:
    def __init__(self, payload):
        if len(payload) < CDR_HEADER_SIZE:
            raise ValueError("CDR payload too short")
        self.payload = payload
        self.offset = CDR_HEADER_SIZE

    def align(self, alignment):
        remainder = (self.offset - CDR_HEADER_SIZE) % alignment
        if remainder:
            self.offset += alignment - remainder

    def require(self, size):
        if self.offset + size > len(self.payload):
            raise ValueError("CDR payload ended before expected field")

    def read_bool(self):
        self.require(1)
        value = struct.unpack_from("<?", self.payload, self.offset)[0]
        self.offset += 1
        return value

    def read_int32(self):
        self.align(4)
        self.require(4)
        value = struct.unpack_from("<i", self.payload, self.offset)[0]
        self.offset += 4
        return value

    def read_int64(self):
        self.align(8)
        self.require(8)
        value = struct.unpack_from("<q", self.payload, self.offset)[0]
        self.offset += 8
        return value

    def read_uint32(self):
        self.align(4)
        self.require(4)
        value = struct.unpack_from("<I", self.payload, self.offset)[0]
        self.offset += 4
        return value

    def read_uint64(self):
        self.align(8)
        self.require(8)
        value = struct.unpack_from("<Q", self.payload, self.offset)[0]
        self.offset += 8
        return value

    def read_uint8(self):
        self.require(1)
        value = struct.unpack_from("<B", self.payload, self.offset)[0]
        self.offset += 1
        return value

    def read_float64(self):
        self.align(8)
        self.require(8)
        value = struct.unpack_from("<d", self.payload, self.offset)[0]
        self.offset += 8
        return value

    def read_string(self):
        length = self.read_uint32()
        if length == 0:
            return ""

        self.require(length)
        value = self.payload[self.offset:self.offset + length]
        self.offset += length
        if value.endswith(b"\0"):
            value = value[:-1]
        return value.decode("utf-8", errors="replace")

    def read_sequence(self, read_item):
        length = self.read_uint32()
        return [read_item(self) for _index in range(length)]

    def read_uint8_sequence(self):
        length = self.read_uint32()
        self.require(length)
        value = self.payload[self.offset:self.offset + length]
        self.offset += length
        return value


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


def encode_string_request(value):
    writer = CdrWriter()
    writer.write_string(value)
    return writer.to_bytes()


def encode_delete_task_request(task_id, force):
    writer = CdrWriter()
    writer.write_string(task_id)
    writer.write_bool(force)
    return writer.to_bytes()


def encode_empty_request():
    return CdrWriter().to_bytes()


def normalized_int32(value, fallback=0):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return fallback
    return max(-0x80000000, min(parsed, 0x7FFFFFFF))


def normalized_float64(value, fallback=0.0):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback
    return parsed if math.isfinite(parsed) else fallback


def encode_recovery_lifecycle_action(writer, action):
    if not isinstance(action, dict):
        action = {}

    writer.write_string(action.get("action_name"))
    writer.write_string(action.get("parameters_json", "{}"))
    writer.write_string(action.get("failure_policy", "required"))


def encode_unit_task_spec(writer, unit_task, index):
    if not isinstance(unit_task, dict):
        unit_task = {}

    writer.write_int32(normalized_int32(unit_task.get("seq"), index))
    writer.write_string(unit_task.get("waypoint"))
    writer.write_string(unit_task.get("action_name"))
    writer.write_string(unit_task.get("action_params_json", "{}"))
    writer.write_string(unit_task.get("recovery_resume_mode", "operator_required"))
    writer.write_string(unit_task.get("recovery_approach_waypoint"))
    writer.write_float64(normalized_float64(unit_task.get("recovery_position_tolerance_m"), 0.1))
    writer.write_bool(unit_task.get("recovery_yaw_tolerance_enabled", False))
    writer.write_float64(normalized_float64(unit_task.get("recovery_yaw_tolerance_rad"), 0.0))
    writer.write_int32(normalized_int32(unit_task.get("recovery_max_attempts"), 3))
    writer.write_float64(normalized_float64(unit_task.get("recovery_clear_timeout_sec"), 300.0))

    on_suspend_actions = (
        unit_task.get("on_suspend_actions")
        if isinstance(unit_task.get("on_suspend_actions"), list)
        else []
    )
    writer.write_uint32(len(on_suspend_actions))
    for action in on_suspend_actions:
        encode_recovery_lifecycle_action(writer, action)

    before_redispatch_actions = (
        unit_task.get("before_redispatch_actions")
        if isinstance(unit_task.get("before_redispatch_actions"), list)
        else []
    )
    writer.write_uint32(len(before_redispatch_actions))
    for action in before_redispatch_actions:
        encode_recovery_lifecycle_action(writer, action)


def encode_recovery_task_mapping(writer, mapping):
    if not isinstance(mapping, dict):
        mapping = {}

    writer.write_uint8(mapping.get("recovery_task_index", 0))
    writer.write_string(mapping.get("recovery_task_definition_id"))


def encode_set_area_display_name_request(area_index, display_name):
    writer = CdrWriter()
    writer.write_uint32(normalized_storage_uint32(area_index))
    writer.write_string(display_name)
    return writer.to_bytes()


def encode_create_task_request(task):
    unit_tasks = task.get("unit_tasks") if isinstance(task.get("unit_tasks"), list) else []
    recovery_task_mappings = (
        task.get("recovery_task_mappings")
        if isinstance(task.get("recovery_task_mappings"), list)
        else []
    )

    writer = CdrWriter()
    writer.write_string(task.get("name"))
    writer.write_string(task.get("description"))
    writer.write_string(task.get("robot_name"))
    writer.write_string(task.get("fleet_name"))
    writer.write_string(task.get("waypoint"))
    writer.write_string(task.get("action_name"))
    writer.write_string(task.get("parameters_json", "{}"))
    writer.write_uint32(len(unit_tasks))
    for index, unit_task in enumerate(unit_tasks):
        encode_unit_task_spec(writer, unit_task, index)
    writer.write_uint32(len(recovery_task_mappings))
    for mapping in recovery_task_mappings:
        encode_recovery_task_mapping(writer, mapping)
    return writer.to_bytes()


def normalized_storage_uint32(value, fallback=0):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return fallback
    return max(0, min(parsed, 0xFFFFFFFF))


def encode_storage_shelf(writer, shelf):
    if not isinstance(shelf, dict):
        shelf = {}

    writer.write_uint32(normalized_storage_uint32(shelf.get("shelf_index")))
    writer.write_uint32(max(1, normalized_storage_uint32(shelf.get("columns"), 1)))
    writer.write_uint32(max(1, normalized_storage_uint32(shelf.get("rows"), 1)))
    writer.write_string(shelf.get("shelf_side"))


def encode_storage_area(writer, area):
    if not isinstance(area, dict):
        area = {}

    shelves = area.get("shelves") if isinstance(area.get("shelves"), list) else []
    writer.write_uint32(normalized_storage_uint32(area.get("area_index")))
    writer.write_string(area.get("display_name"))
    writer.write_uint32(len(shelves))
    for shelf in shelves:
        encode_storage_shelf(writer, shelf)


def encode_reinit_storage_request(request):
    if not isinstance(request, dict):
        request = {}

    layout = request.get("layout") if isinstance(request.get("layout"), dict) else {}
    areas = layout.get("areas") if isinstance(layout.get("areas"), list) else []

    writer = CdrWriter()
    writer.write_string(request.get("request_id"))
    writer.write_bool(request.get("confirm_reinitialize") is True)
    writer.write_string(request.get("caller_id"))
    writer.write_string(request.get("reason"))
    writer.write_uint32(len(areas))
    for area in areas:
        encode_storage_area(writer, area)
    return writer.to_bytes()


def encode_lift_request_payload(request):
    now = time.time()
    request_time = request.get("requestTime") if isinstance(request.get("requestTime"), dict) else {}
    sec = request_time.get("sec")
    nanosec = request_time.get("nanosec")
    if not isinstance(sec, int):
        sec = int(now)
    if not isinstance(nanosec, int):
        nanosec = int((now - int(now)) * 1_000_000_000)

    writer = CdrWriter()
    writer.write_string(request.get("liftName"))
    writer.write_int32(sec)
    writer.write_uint32(nanosec)
    writer.write_string(request.get("sessionId"))
    writer.write_uint8(request.get("requestType", 1))
    writer.write_string(request.get("destinationFloor"))
    writer.write_uint8(request.get("doorState", 2))
    return writer.to_bytes()


def encode_door_request_payload(request):
    now = time.time()
    request_time = request.get("requestTime") if isinstance(request.get("requestTime"), dict) else {}
    requested_mode = request.get("requestedMode") if isinstance(request.get("requestedMode"), dict) else {}
    sec = request_time.get("sec")
    nanosec = request_time.get("nanosec")
    if not isinstance(sec, int):
        sec = int(now)
    if not isinstance(nanosec, int):
        nanosec = int((now - int(now)) * 1_000_000_000)

    writer = CdrWriter()
    writer.write_int32(sec)
    writer.write_uint32(nanosec)
    writer.write_string(request.get("requesterId"))
    writer.write_string(request.get("doorName"))
    writer.write_uint32(requested_mode.get("value", 0))
    return writer.to_bytes()


def normalized_float64(value, fallback):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback
    return parsed if math.isfinite(parsed) else fallback


def encode_point_cloud_roi_request(request):
    if not isinstance(request, dict):
        request = {}

    writer = CdrWriter()
    writer.write_float64(normalized_float64(request.get("min_x"), 0.0))
    writer.write_float64(normalized_float64(request.get("max_x"), 3.0))
    writer.write_float64(normalized_float64(request.get("min_y"), -0.5))
    writer.write_float64(normalized_float64(request.get("max_y"), 0.5))
    writer.write_float64(normalized_float64(request.get("min_z"), -0.2))
    writer.write_float64(normalized_float64(request.get("max_z"), 1.0))
    writer.write_bool(request.get("remove_ground") is True)
    writer.write_float64(normalized_float64(request.get("ground_plane_a"), 0.0))
    writer.write_float64(normalized_float64(request.get("ground_plane_b"), 0.0))
    writer.write_float64(normalized_float64(request.get("ground_plane_c"), 1.0))
    writer.write_float64(normalized_float64(request.get("ground_plane_d"), 0.0))
    writer.write_float64(normalized_float64(request.get("ground_distance_threshold"), 0.06))
    return writer.to_bytes()


def read_point_value(data, offset, field, endian):
    format_info = POINT_FIELD_DATATYPES.get(field["datatype"])
    if format_info is None:
        return None

    format_code, size = format_info
    value_offset = offset + field["offset"]
    if value_offset + size > len(data):
        return None

    return struct.unpack_from(f"{endian}{format_code}", data, value_offset)[0]


def decode_point_cloud2(reader, max_points):
    stamp_sec = reader.read_int32()
    stamp_nanosec = reader.read_uint32()
    frame_id = reader.read_string()
    height = reader.read_uint32()
    width = reader.read_uint32()

    field_count = reader.read_uint32()
    if field_count > 256:
        raise ValueError("pointcloud field count is too large")

    fields = []
    for _index in range(field_count):
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

    if point_step <= 0 and width * height == 0 and len(data) == 0:
        return {
            "frameId": frame_id,
            "originalFrameId": frame_id,
            "targetFrameId": "base_footprint",
            "transformApplied": False,
            "stamp": {
                "sec": stamp_sec,
                "nanosec": stamp_nanosec,
            },
            "height": height,
            "width": width,
            "pointStep": point_step,
            "rowStep": row_step,
            "isDense": is_dense,
            "pointCount": 0,
            "sampledCount": 0,
            "points": [],
        }

    if point_step <= 0 or point_step > 4096:
        raise ValueError("invalid pointcloud point_step")

    point_count = min(width * height, len(data) // point_step)
    fields_by_name = {field["name"].lower(): field for field in fields}
    x_field = fields_by_name.get("x")
    y_field = fields_by_name.get("y")
    z_field = fields_by_name.get("z")
    if point_count > 0 and (x_field is None or y_field is None or z_field is None):
        raise ValueError("pointcloud is missing x/y/z fields")

    data_endian = ">" if is_bigendian else "<"
    max_sampled_points = max(100, min(int(max_points), 50000))
    stride = max(1, math.ceil(point_count / max_sampled_points)) if point_count > 0 else 1
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

    return {
        "frameId": frame_id,
        "originalFrameId": frame_id,
        "targetFrameId": "base_footprint",
        "transformApplied": False,
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


def normalized_max_points(value):
    try:
        max_points = int(value)
    except (TypeError, ValueError):
        return 3500
    return max(100, min(max_points, 50000))


def decode_point_cloud_roi_response(payload, max_points):
    reader = CdrReader(payload)
    return {
        "success": reader.read_bool(),
        "message": reader.read_string(),
        "pointCloud": decode_point_cloud2(reader, normalized_max_points(max_points)),
    }


def decode_write_coil_response(payload):
    if len(payload) < CDR_HEADER_SIZE + 1:
        raise ValueError("write_coil response payload too short")
    return bool(struct.unpack_from("<?", payload, CDR_HEADER_SIZE)[0])


def empty_task_info():
    return {
        "task_id": "",
        "task_definition_id": "",
        "latest_task_execution_id": "",
        "active_task_execution_id": "",
        "name": "",
        "description": "",
        "robot_name": "",
        "fleet_name": "",
        "status": "",
        "created_at_unix_ms": 0,
        "updated_at_unix_ms": 0,
        "execution_created_at_unix_ms": 0,
        "execution_updated_at_unix_ms": 0,
    }


def decode_current_task_info(reader):
    return {
        "task_id": reader.read_string(),
        "name": reader.read_string(),
        "description": reader.read_string(),
        "robot_name": reader.read_string(),
        "fleet_name": reader.read_string(),
        "status": reader.read_string(),
        "created_at_unix_ms": reader.read_int64(),
        "updated_at_unix_ms": reader.read_int64(),
        "task_definition_id": reader.read_string(),
        "latest_task_execution_id": reader.read_string(),
        "active_task_execution_id": reader.read_string(),
        "execution_created_at_unix_ms": reader.read_int64(),
        "execution_updated_at_unix_ms": reader.read_int64(),
    }


def decode_current_id_first_task_info(reader):
    return {
        "task_id": reader.read_string(),
        "task_definition_id": reader.read_string(),
        "latest_task_execution_id": reader.read_string(),
        "active_task_execution_id": reader.read_string(),
        "name": reader.read_string(),
        "description": reader.read_string(),
        "robot_name": reader.read_string(),
        "fleet_name": reader.read_string(),
        "status": reader.read_string(),
        "created_at_unix_ms": reader.read_int64(),
        "updated_at_unix_ms": reader.read_int64(),
        "execution_created_at_unix_ms": reader.read_int64(),
        "execution_updated_at_unix_ms": reader.read_int64(),
    }


def decode_task_info(reader):
    task = {
        "task_id": reader.read_string(),
        "task_definition_id": reader.read_string(),
        "latest_task_execution_id": reader.read_string(),
        "active_task_execution_id": reader.read_string(),
        "name": reader.read_string(),
        "robot_name": reader.read_string(),
        "fleet_name": reader.read_string(),
        "status": reader.read_string(),
        "created_at_unix_ms": reader.read_int64(),
        "updated_at_unix_ms": reader.read_int64(),
        "execution_created_at_unix_ms": reader.read_int64(),
        "execution_updated_at_unix_ms": reader.read_int64(),
    }
    return task


def decode_legacy_task_info(reader):
    task = empty_task_info()
    task.update({
        "task_id": reader.read_string(),
        "name": reader.read_string(),
        "robot_name": reader.read_string(),
        "fleet_name": reader.read_string(),
        "status": reader.read_string(),
        "created_at_unix_ms": reader.read_int64(),
        "updated_at_unix_ms": reader.read_int64(),
    })
    task["execution_created_at_unix_ms"] = task["created_at_unix_ms"]
    task["execution_updated_at_unix_ms"] = task["updated_at_unix_ms"]
    return task


def decode_legacy_no_fleet_task_info(reader):
    task = empty_task_info()
    task.update({
        "task_id": reader.read_string(),
        "name": reader.read_string(),
        "robot_name": reader.read_string(),
        "status": reader.read_string(),
        "created_at_unix_ms": reader.read_int64(),
        "updated_at_unix_ms": reader.read_int64(),
    })
    task["execution_created_at_unix_ms"] = task["created_at_unix_ms"]
    task["execution_updated_at_unix_ms"] = task["updated_at_unix_ms"]
    return task


def decode_reordered_task_info(reader):
    task = empty_task_info()
    task.update({
        "task_id": reader.read_string(),
        "name": reader.read_string(),
        "robot_name": reader.read_string(),
        "fleet_name": reader.read_string(),
        "status": reader.read_string(),
        "created_at_unix_ms": reader.read_int64(),
        "updated_at_unix_ms": reader.read_int64(),
        "task_definition_id": reader.read_string(),
        "latest_task_execution_id": reader.read_string(),
        "active_task_execution_id": reader.read_string(),
        "execution_created_at_unix_ms": reader.read_int64(),
        "execution_updated_at_unix_ms": reader.read_int64(),
    })
    return task


def is_plausible_task_info(task):
    status = task.get("status") or ""
    return not status or status in TASK_STATUSES


def describe_payload(payload, max_bytes=96):
    prefix = payload[:max_bytes].hex()
    return f"payload_len={len(payload)} payload_hex_prefix={prefix}"


def decode_recovery_lifecycle_action(reader):
    return {
        "action_name": reader.read_string(),
        "parameters_json": reader.read_string(),
        "failure_policy": reader.read_string(),
    }


def decode_recovery_task_mapping(reader):
    return {
        "recovery_task_index": reader.read_uint8(),
        "recovery_task_definition_id": reader.read_string(),
    }


def decode_unit_task_info(reader):
    return {
        "unit_id": reader.read_string(),
        "seq": reader.read_int32(),
        "waypoint": reader.read_string(),
        "action_name": reader.read_string(),
        "status": reader.read_string(),
        "attempts": reader.read_int32(),
        "last_error": reader.read_string(),
        "task_definition_id": reader.read_string(),
        "task_execution_id": reader.read_string(),
        "unit_task_definition_id": reader.read_string(),
        "unit_task_execution_id": reader.read_string(),
        "recovery_resume_mode": reader.read_string(),
        "recovery_approach_waypoint": reader.read_string(),
        "recovery_position_tolerance_m": reader.read_float64(),
        "recovery_yaw_tolerance_enabled": reader.read_bool(),
        "recovery_yaw_tolerance_rad": reader.read_float64(),
        "recovery_max_attempts": reader.read_int32(),
        "recovery_clear_timeout_sec": reader.read_float64(),
        "on_suspend_actions": reader.read_sequence(decode_recovery_lifecycle_action),
        "before_redispatch_actions": reader.read_sequence(decode_recovery_lifecycle_action),
    }


def decode_legacy_unit_task_info(reader):
    return {
        "unit_id": reader.read_string(),
        "seq": reader.read_int32(),
        "waypoint": reader.read_string(),
        "action_name": reader.read_string(),
        "status": reader.read_string(),
        "attempts": reader.read_int32(),
        "last_error": reader.read_string(),
        "task_definition_id": reader.read_string(),
        "task_execution_id": reader.read_string(),
        "unit_task_definition_id": reader.read_string(),
        "unit_task_execution_id": reader.read_string(),
        "recovery_resume_mode": "",
        "recovery_approach_waypoint": "",
        "recovery_position_tolerance_m": 0.1,
        "recovery_yaw_tolerance_enabled": False,
        "recovery_yaw_tolerance_rad": 0.0,
        "recovery_max_attempts": 3,
        "recovery_clear_timeout_sec": 300.0,
        "on_suspend_actions": [],
        "before_redispatch_actions": [],
    }


def decode_task_info_sequence(payload, task_decoder):
    reader = CdrReader(payload)
    tasks = reader.read_sequence(task_decoder)
    unknown_statuses = sorted({
        task.get("status") or ""
        for task in tasks
        if not task.get("status") or not is_plausible_task_info(task)
    })
    if unknown_statuses:
        raise ValueError(f"task response did not match TaskInfo status fields: {unknown_statuses}")
    if reader.offset < len(payload) and any(payload[reader.offset:]):
        raise ValueError("task response had trailing undecoded fields")
    return tasks


def decode_list_tasks_response(payload):
    decoder_errors = []
    for task_decoder in (
        decode_current_task_info,
        decode_current_id_first_task_info,
        decode_task_info,
        decode_reordered_task_info,
        decode_legacy_task_info,
        decode_legacy_no_fleet_task_info,
    ):
        try:
            return decode_task_info_sequence(payload, task_decoder)
        except Exception as error:
            decoder_errors.append(f"{task_decoder.__name__}: {error}")

    details = "; ".join(decoder_errors) or "no decoder attempted"
    raise ValueError(f"unable to decode list_tasks response ({details}); {describe_payload(payload)}")


def decode_action_parameter_info(reader):
    return {
        "name": reader.read_string(),
        "data_type": reader.read_string(),
    }


def decode_action_info(reader):
    return {
        "action_name": reader.read_string(),
        "required_parameters": reader.read_sequence(decode_action_parameter_info),
    }


def decode_list_actions_response(payload):
    reader = CdrReader(payload)
    response = {
        "ok": reader.read_bool(),
        "actions": reader.read_sequence(decode_action_info),
        "message": reader.read_string(),
    }
    if reader.offset < len(payload) and any(payload[reader.offset:]):
        raise ValueError("list_actions response had trailing undecoded fields")
    return response


def decode_get_task_response_with(
    payload,
    task_decoder,
    unit_task_decoder,
    include_recovery_mappings,
):
    reader = CdrReader(payload)
    found = reader.read_bool()
    task = task_decoder(reader)
    if found and not is_plausible_task_info(task):
        raise ValueError("task response did not match TaskInfo status fields")

    response = {
        "found": found,
        "task": task,
        "unit_tasks": reader.read_sequence(unit_task_decoder),
        "recovery_task_mappings": (
            reader.read_sequence(decode_recovery_task_mapping)
            if include_recovery_mappings
            else []
        ),
        "message": reader.read_string(),
    }
    if reader.offset < len(payload) and any(payload[reader.offset:]):
        raise ValueError("get_task response had trailing undecoded fields")
    return response


def decode_get_task_response(payload):
    decoder_errors = []
    for task_decoder, unit_task_decoder, include_recovery_mappings in (
        (decode_current_task_info, decode_unit_task_info, True),
        (decode_current_id_first_task_info, decode_unit_task_info, True),
        (decode_task_info, decode_legacy_unit_task_info, False),
        (decode_reordered_task_info, decode_legacy_unit_task_info, False),
        (decode_legacy_task_info, decode_legacy_unit_task_info, False),
        (decode_legacy_no_fleet_task_info, decode_legacy_unit_task_info, False),
    ):
        try:
            return decode_get_task_response_with(
                payload,
                task_decoder,
                unit_task_decoder,
                include_recovery_mappings,
            )
        except Exception as error:
            decoder_errors.append(f"{task_decoder.__name__}: {error}")

    details = "; ".join(decoder_errors) or "no decoder attempted"
    raise ValueError(f"unable to decode get_task response ({details}); {describe_payload(payload)}")


def decode_create_task_response(payload):
    reader = CdrReader(payload)
    response = {
        "ok": reader.read_bool(),
        "task_id": reader.read_string(),
        "task_definition_id": reader.read_string(),
        "message": reader.read_string(),
    }
    if reader.offset < len(payload) and any(payload[reader.offset:]):
        raise ValueError("create_task response had trailing undecoded fields")
    return response


def decode_run_task_response(payload):
    reader = CdrReader(payload)
    response = {
        "accepted": reader.read_bool(),
        "task_execution_id": reader.read_string(),
        "message": reader.read_string(),
    }
    if reader.offset < len(payload) and any(payload[reader.offset:]):
        raise ValueError("run_task response had trailing undecoded fields")
    return response


def decode_ok_message_response(payload):
    reader = CdrReader(payload)
    response = {
        "ok": reader.read_bool(),
        "message": reader.read_string(),
    }
    if reader.offset < len(payload) and any(payload[reader.offset:]):
        raise ValueError("task response had trailing undecoded fields")
    return response


def decode_reinit_storage_response(payload):
    reader = CdrReader(payload)
    response = {
        "success": reader.read_bool(),
        "error_code": reader.read_string(),
        "message": reader.read_string(),
        "old_revision": reader.read_uint64(),
        "new_revision": reader.read_uint64(),
    }
    if reader.offset < len(payload) and any(payload[reader.offset:]):
        raise ValueError("reinit_storage response had trailing undecoded fields")
    return response


def decode_set_area_display_name_response(payload):
    reader = CdrReader(payload)
    response = {
        "success": reader.read_bool(),
        "error_code": reader.read_string(),
        "message": reader.read_string(),
        "layout_revision": reader.read_uint64(),
    }
    if reader.offset < len(payload) and any(payload[reader.offset:]):
        raise ValueError("set_area_display_name response had trailing undecoded fields")
    return response


def normalize_key(value):
    return str(value or "").strip().strip("/")


def normalized_timeout(message, default_timeout=5.0):
    try:
        timeout = float(message.get("timeoutSec", default_timeout))
    except (TypeError, ValueError):
        return default_timeout
    if timeout <= 0 or timeout > 60:
        return default_timeout
    return timeout


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


def list_tasks(session, message):
    key = normalize_key(message.get("key"))
    request_id = str(message.get("requestId") or "")
    robot_name_filter = str(message.get("robotNameFilter") or "")

    response_message = {
        "type": "service-response",
        "service": "list_tasks",
        "key": key,
        "requestId": request_id,
        "success": False,
        "message": "no service response",
        "tasks": [],
    }

    if not key:
        response_message["message"] = "missing list_tasks service key"
        emit(response_message)
        return

    try:
        replies = session.get(
            key,
            timeout=normalized_timeout(message),
            payload=encode_string_request(robot_name_filter),
        )
        received_reply = False
        for reply in replies:
            received_reply = True
            if reply.ok is not None:
                response_message["tasks"] = decode_list_tasks_response(reply.ok.payload.to_bytes())
                response_message["success"] = True
                response_message["message"] = "success"
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


def list_actions(session, message):
    key = normalize_key(message.get("key"))
    request_id = str(message.get("requestId") or "")

    response_message = {
        "type": "service-response",
        "service": "list_actions",
        "key": key,
        "requestId": request_id,
        "success": False,
        "ok": False,
        "actions": [],
        "message": "no service response",
    }

    if not key:
        response_message["message"] = "missing list_actions service key"
        emit(response_message)
        return

    try:
        replies = session.get(
            key,
            timeout=normalized_timeout(message),
            payload=encode_empty_request(),
        )
        received_reply = False
        for reply in replies:
            received_reply = True
            if reply.ok is not None:
                response_message.update(decode_list_actions_response(reply.ok.payload.to_bytes()))
                response_message["success"] = True
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


def get_task(session, message):
    key = normalize_key(message.get("key"))
    request_id = str(message.get("requestId") or "")
    task_id = str(message.get("taskId") or "")

    response_message = {
        "type": "service-response",
        "service": "get_task",
        "key": key,
        "requestId": request_id,
        "success": False,
        "found": False,
        "task": empty_task_info(),
        "unit_tasks": [],
        "recovery_task_mappings": [],
        "message": "no service response",
    }

    if not key:
        response_message["message"] = "missing get_task service key"
        emit(response_message)
        return
    if not task_id:
        response_message["message"] = "missing task_id"
        emit(response_message)
        return

    try:
        replies = session.get(
            key,
            timeout=normalized_timeout(message),
            payload=encode_string_request(task_id),
        )
        received_reply = False
        for reply in replies:
            received_reply = True
            if reply.ok is not None:
                detail = decode_get_task_response(reply.ok.payload.to_bytes())
                response_message.update(detail)
                response_message["success"] = True
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


def create_task(session, message):
    key = normalize_key(message.get("key"))
    request_id = str(message.get("requestId") or "")
    task = message.get("task") if isinstance(message.get("task"), dict) else {}

    response_message = {
        "type": "service-response",
        "service": "create_task",
        "key": key,
        "requestId": request_id,
        "success": False,
        "ok": False,
        "task_id": "",
        "task_definition_id": "",
        "message": "no service response",
    }

    if not key:
        response_message["message"] = "missing create_task service key"
        emit(response_message)
        return

    try:
        replies = session.get(
            key,
            timeout=normalized_timeout(message),
            payload=encode_create_task_request(task),
        )
        received_reply = False
        for reply in replies:
            received_reply = True
            if reply.ok is not None:
                response_message.update(decode_create_task_response(reply.ok.payload.to_bytes()))
                response_message["success"] = True
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


def run_task(session, message):
    key = normalize_key(message.get("key"))
    request_id = str(message.get("requestId") or "")
    task_id = str(message.get("taskId") or "")

    response_message = {
        "type": "service-response",
        "service": "run_task",
        "key": key,
        "requestId": request_id,
        "success": False,
        "accepted": False,
        "task_execution_id": "",
        "message": "no service response",
    }

    if not key:
        response_message["message"] = "missing run_task service key"
        emit(response_message)
        return
    if not task_id:
        response_message["message"] = "missing task_id"
        emit(response_message)
        return

    try:
        replies = session.get(
            key,
            timeout=normalized_timeout(message),
            payload=encode_string_request(task_id),
        )
        received_reply = False
        for reply in replies:
            received_reply = True
            if reply.ok is not None:
                response_message.update(decode_run_task_response(reply.ok.payload.to_bytes()))
                response_message["success"] = True
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


def cancel_task(session, message):
    key = normalize_key(message.get("key"))
    request_id = str(message.get("requestId") or "")
    task_id = str(message.get("taskId") or "")

    response_message = {
        "type": "service-response",
        "service": "cancel_task",
        "key": key,
        "requestId": request_id,
        "success": False,
        "ok": False,
        "message": "no service response",
    }

    if not key:
        response_message["message"] = "missing cancel_task service key"
        emit(response_message)
        return
    if not task_id:
        response_message["message"] = "missing task_id"
        emit(response_message)
        return

    try:
        replies = session.get(
            key,
            timeout=normalized_timeout(message),
            payload=encode_string_request(task_id),
        )
        received_reply = False
        for reply in replies:
            received_reply = True
            if reply.ok is not None:
                response_message.update(decode_ok_message_response(reply.ok.payload.to_bytes()))
                response_message["success"] = True
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


def delete_task(session, message):
    key = normalize_key(message.get("key"))
    request_id = str(message.get("requestId") or "")
    task_id = str(message.get("taskId") or "")
    force = bool(message.get("force", False))

    response_message = {
        "type": "service-response",
        "service": "delete_task",
        "key": key,
        "requestId": request_id,
        "success": False,
        "ok": False,
        "message": "no service response",
    }

    if not key:
        response_message["message"] = "missing delete_task service key"
        emit(response_message)
        return
    if not task_id:
        response_message["message"] = "missing task_id"
        emit(response_message)
        return

    try:
        replies = session.get(
            key,
            timeout=normalized_timeout(message),
            payload=encode_delete_task_request(task_id, force),
        )
        received_reply = False
        for reply in replies:
            received_reply = True
            if reply.ok is not None:
                response_message.update(decode_ok_message_response(reply.ok.payload.to_bytes()))
                response_message["success"] = True
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


def set_area_display_name(session, message):
    key = normalize_key(message.get("key"))
    request_id = str(message.get("requestId") or "")
    area_index = message.get("areaIndex", 0)
    display_name = str(message.get("displayName") or "")

    response_message = {
        "type": "service-response",
        "service": "set_area_display_name",
        "key": key,
        "requestId": request_id,
        "received": False,
        "success": False,
        "error_code": "",
        "message": "no service response",
        "layout_revision": 0,
    }

    if not key:
        response_message["message"] = "missing set_area_display_name service key"
        emit(response_message)
        return
    if normalized_storage_uint32(area_index) <= 0:
        response_message["message"] = "missing area_index"
        emit(response_message)
        return

    try:
        replies = session.get(
            key,
            timeout=normalized_timeout(message),
            payload=encode_set_area_display_name_request(area_index, display_name),
        )
        received_reply = False
        for reply in replies:
            received_reply = True
            if reply.ok is not None:
                response_message.update(decode_set_area_display_name_response(reply.ok.payload.to_bytes()))
                response_message["received"] = True
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


def reinit_storage(session, message):
    key = normalize_key(message.get("key"))
    request_id = str(message.get("requestId") or "")
    request = message.get("request") if isinstance(message.get("request"), dict) else {}

    response_message = {
        "type": "service-response",
        "service": "reinit_storage",
        "key": key,
        "requestId": request_id,
        "received": False,
        "success": False,
        "error_code": "",
        "message": "no service response",
        "old_revision": 0,
        "new_revision": 0,
    }

    if not key:
        response_message["message"] = "missing reinit_storage service key"
        emit(response_message)
        return

    try:
        replies = session.get(
            key,
            timeout=normalized_timeout(message, 15.0),
            payload=encode_reinit_storage_request(request),
        )
        received_reply = False
        for reply in replies:
            received_reply = True
            if reply.ok is not None:
                response_message.update(decode_reinit_storage_response(reply.ok.payload.to_bytes()))
                response_message["received"] = True
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


def get_point_cloud_roi(session, message):
    key = normalize_key(message.get("key"))
    request_id = str(message.get("requestId") or "")
    request = message.get("request") if isinstance(message.get("request"), dict) else {}
    max_points = normalized_max_points(message.get("maxPoints"))

    response_message = {
        "type": "service-response",
        "service": "get_point_cloud_roi",
        "key": key,
        "requestId": request_id,
        "success": False,
        "message": "no service response",
        "pointCloud": None,
    }

    if not key:
        response_message["message"] = "missing get_point_cloud_roi service key"
        emit(response_message)
        return

    try:
        replies = session.get(
            key,
            timeout=normalized_timeout(message, 10.0),
            payload=encode_point_cloud_roi_request(request),
        )
        received_reply = False
        for reply in replies:
            received_reply = True
            if reply.ok is not None:
                response_message.update(decode_point_cloud_roi_response(reply.ok.payload.to_bytes(), max_points))
                if response_message["pointCloud"] is not None:
                    response_message["pointCloud"]["key"] = key
                    response_message["pointCloud"]["topic"] = key
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
            if message_type == "list_tasks":
                list_tasks(session, message)
                continue
            if message_type == "list_actions":
                list_actions(session, message)
                continue
            if message_type == "get_task":
                get_task(session, message)
                continue
            if message_type == "create_task":
                create_task(session, message)
                continue
            if message_type == "run_task":
                run_task(session, message)
                continue
            if message_type == "cancel_task":
                cancel_task(session, message)
                continue
            if message_type == "delete_task":
                delete_task(session, message)
                continue
            if message_type == "set_area_display_name":
                set_area_display_name(session, message)
                continue
            if message_type == "reinit_storage":
                reinit_storage(session, message)
                continue
            if message_type == "get_point_cloud_roi":
                get_point_cloud_roi(session, message)
                continue
            if message_type == "lift_request":
                key = normalize_key(message.get("key"))
                if not key:
                    emit({"type": "error", "message": "missing lift request key"})
                    continue

                try:
                    publisher = publishers.get(key)
                    if publisher is None:
                        publisher = session.declare_publisher(key)
                        publishers[key] = publisher

                    publisher.put(encode_lift_request_payload(message.get("request") or {}))
                    emit({"type": "published", "key": key})
                except Exception as error:
                    emit({"type": "error", "key": key, "message": str(error)})
                continue
            if message_type == "door_request":
                key = normalize_key(message.get("key"))
                if not key:
                    emit({"type": "error", "message": "missing door request key"})
                    continue

                try:
                    publisher = publishers.get(key)
                    if publisher is None:
                        publisher = session.declare_publisher(key)
                        publishers[key] = publisher

                    publisher.put(encode_door_request_payload(message.get("request") or {}))
                    emit({"type": "published", "key": key})
                except Exception as error:
                    emit({"type": "error", "key": key, "message": str(error)})
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
