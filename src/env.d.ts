import type { ShelfState } from './service/apiServer'
import type { BondStatusMessage, BuildingMapMessage, FleetDataMessage, FleetDiagnosticStateMessage, LaserScanMessage, MotorStatesMessage, PointCloudMessage, PoseMessage, RmfDoorRequestMessage, RmfDoorStateMessage, RmfLiftRequestMessage, RmfLiftStateMessage, RmfScheduleMarkerCacheMessage, StorageAreaDisplayNameResult, StorageReinitRequestPayload, StorageReinitResult, StorageStateMessage, TaskManagerCancelTaskResult, TaskManagerCreateTaskPayload, TaskManagerCreateTaskResult, TaskManagerDeleteTaskResult, TaskManagerListActionsResult, TaskManagerRunTaskResult, TaskManagerTaskDetail, TaskManagerTaskInfo, TwistCommand, UInt8MultiArrayMessage } from './types'

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_DOMAIN?: string
    readonly VITE_WS_DOMAIN?: string
    readonly VITE_DESKTOP_HOST?: string
    readonly VITE_COMPOSE_CONTROL_TOKEN?: string
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }

  interface ZenohRobotPoseStartOptions {
    host: string
    namespace: string
  }

  interface ZenohRobotPoseStatusMessage {
    type: 'status'
    state: string
    endpoint?: string
    key?: string
    keys?: string[]
    source?: 'priority_pose' | 'robot_pose' | 'laser_pose'
    fallbackDelayMs?: number
    code?: number | null
    signal?: string | null
  }

  interface ZenohRobotPosePayloadMessage {
    type: 'pose'
    key: string
    source?: 'robot_pose' | 'laser_pose'
    pose: PoseMessage
  }

  interface ZenohRobotPoseErrorMessage {
    type: 'error' | 'decode-error' | 'log'
    message?: string
    key?: string
    byteLength?: number
  }

  type ZenohRobotPoseMessage = ZenohRobotPoseStatusMessage | ZenohRobotPosePayloadMessage | ZenohRobotPoseErrorMessage

  interface ZenohPointCloudStartOptions {
    host: string
    namespace: string
    topics?: string[]
    targetFrames?: string[]
    maxPoints?: number
    minIntervalMs?: number
  }

  interface ZenohPointCloudStatusMessage {
    type: 'status'
    state: string
    endpoint?: string
    key?: string
    keys?: string[]
    tfKeys?: string[]
    targetFrames?: string[]
    urdfStaticTransforms?: number
    urdfStaticError?: string | null
    code?: number | null
    signal?: string | null
  }

  interface ZenohPointCloudPayloadMessage extends PointCloudMessage {
    type: 'pointcloud'
    key: string
    topic: string
  }

  interface ZenohPointCloudErrorMessage {
    type: 'error' | 'decode-error' | 'tf-decode-error' | 'log'
    message?: string
    key?: string
    byteLength?: number
  }

  type ZenohPointCloudMessage = ZenohPointCloudStatusMessage | ZenohPointCloudPayloadMessage | ZenohPointCloudErrorMessage

  interface ZenohTelemetryStartOptions {
    host: string
    namespace: string
    includeScan?: boolean
    scanTopics?: string[]
    includeMap?: boolean
  }

  interface ZenohTelemetryStatusMessage {
    type: 'status'
    state: string
    endpoint?: string
    keys?: string[]
    tfKeys?: string[]
    targetFrames?: string[]
    urdfStaticTransforms?: number
    urdfStaticError?: string | null
    commandKey?: string
    actuatorResetKey?: string
    code?: number | null
    signal?: string | null
  }

  interface ZenohTelemetryBatteryMessage {
    type: 'battery'
    key: string
    battery: number
    batteryCurrent: number
  }

  interface ZenohTelemetryBattery2Message {
    type: 'battery2'
    key: string
    battery: number
    batteryCurrent: number
  }

  interface ZenohTelemetryLaserPoseMessage {
    type: 'laser-pose'
    key: string
    pose: PoseMessage
  }

  interface ZenohTelemetryLaserScanMessage {
    type: 'laser-scan'
    key: string
    topic?: string
    scan: LaserScanMessage
  }

  interface ZenohTelemetryCompressedMapMessage {
    type: 'compressed-map'
    key: string
    byteLength: number
    payloadBase64: string
  }

  interface ZenohTelemetryPublishedMessage {
    type: 'published'
    key: string
  }

  interface ZenohTelemetryErrorMessage {
    type: 'error' | 'decode-error' | 'tf-decode-error' | 'log'
    message?: string
    key?: string
    byteLength?: number
  }

  type ZenohTelemetryMessage =
    | ZenohTelemetryStatusMessage
    | ZenohTelemetryBatteryMessage
    | ZenohTelemetryBattery2Message
    | ZenohTelemetryLaserPoseMessage
    | ZenohTelemetryLaserScanMessage
    | ZenohTelemetryCompressedMapMessage
    | ZenohTelemetryPublishedMessage
    | ZenohTelemetryErrorMessage

  interface ZenohMotorStatesStartOptions {
    host: string
    namespace: string
    topics?: string[]
  }

  interface ZenohMotorStatesStatusMessage {
    type: 'status'
    state: string
    endpoint?: string
    keys?: string[]
    reused?: boolean
    code?: number | null
    signal?: string | null
  }

  interface ZenohMotorStatesPayloadMessage extends MotorStatesMessage {
    type: 'motor-states'
    key: string
    namespace?: string
  }

  interface ZenohMotorStatesErrorMessage {
    type: 'error' | 'decode-error' | 'log'
    message?: string
    key?: string
    byteLength?: number
  }

  type ZenohMotorStatesMessage =
    | ZenohMotorStatesStatusMessage
    | ZenohMotorStatesPayloadMessage
    | ZenohMotorStatesErrorMessage

  interface ZenohWheelStatesStartOptions {
    host: string
    namespace?: string
    topics: string[]
  }

  type ZenohWheelStatesMessage = ZenohMotorStatesMessage

  interface ZenohFleetDataStartOptions {
    host: string
    namespace?: string
    topics?: string[]
  }

  interface ZenohFleetDataStatusMessage {
    type: 'status'
    state: string
    endpoint?: string
    keys?: string[]
    reused?: boolean
    code?: number | null
    signal?: string | null
  }

  interface ZenohFleetDataPayloadMessage extends FleetDataMessage {
    type: 'fleet-data'
    key: string
  }

  interface ZenohFleetDataErrorMessage {
    type: 'error' | 'decode-error' | 'log'
    message?: string
    key?: string
    byteLength?: number
  }

  type ZenohFleetDataMessage =
    | ZenohFleetDataStatusMessage
    | ZenohFleetDataPayloadMessage
    | ZenohFleetDataErrorMessage

  interface ZenohBuildingMapStartOptions {
    host: string
    namespace?: string
    topics?: string[]
  }

  interface ZenohBuildingMapStatusMessage {
    type: 'status'
    state: string
    endpoint?: string
    keys?: string[]
    reused?: boolean
    code?: number | null
    signal?: string | null
  }

  interface ZenohBuildingMapPayloadMessage extends BuildingMapMessage {
    type: 'building-map'
    key: string
  }

  interface ZenohBuildingMapErrorMessage {
    type: 'error' | 'decode-error' | 'log'
    message?: string
    key?: string
    byteLength?: number
  }

  type ZenohBuildingMapMessage =
    | ZenohBuildingMapStatusMessage
    | ZenohBuildingMapPayloadMessage
    | ZenohBuildingMapErrorMessage

  interface ZenohRmfStateStartOptions {
    host: string
    namespace?: string
    topics?: string[]
  }

  interface ZenohRmfStateStatusMessage {
    type: 'status'
    state: string
    endpoint?: string
    keys?: string[]
    reused?: boolean
    code?: number | null
    signal?: string | null
  }

  interface ZenohRmfDoorStatePayloadMessage extends RmfDoorStateMessage {
    type: 'door-state'
    key: string
  }

  interface ZenohRmfLiftStatePayloadMessage extends RmfLiftStateMessage {
    type: 'lift-state'
    key: string
  }

  interface ZenohRmfScheduleMarkersPayloadMessage {
    type: 'schedule-markers'
    key: string
    markers: RmfScheduleMarkerCacheMessage
  }

  interface ZenohRmfStorageStatePayloadMessage extends StorageStateMessage {
    type: 'storage-state'
    key: string
  }

  interface ZenohRmfStateErrorMessage {
    type: 'error' | 'decode-error' | 'log'
    message?: string
    key?: string
    byteLength?: number
    expectedType?: string
  }

  type ZenohRmfStateMessage =
    | ZenohRmfStateStatusMessage
    | ZenohRmfDoorStatePayloadMessage
    | ZenohRmfLiftStatePayloadMessage
    | ZenohRmfScheduleMarkersPayloadMessage
    | ZenohRmfStorageStatePayloadMessage
    | ZenohRmfStateErrorMessage

  interface ZenohDidoStartOptions {
    host: string
    topics: string[]
  }

  interface ZenohDidoStatusMessage {
    type: 'status'
    state: string
    endpoint?: string
    keys?: string[]
    reused?: boolean
    code?: number | null
    signal?: string | null
  }

  interface ZenohDidoPayloadMessage extends UInt8MultiArrayMessage {
    type: 'dido'
    key: string
    namespace: string
    channel: 'di' | 'do' | 'unknown'
  }

  interface ZenohDidoErrorMessage {
    type: 'error' | 'decode-error' | 'log'
    message?: string
    key?: string
    byteLength?: number
  }

  type ZenohDidoMessage =
    | ZenohDidoStatusMessage
    | ZenohDidoPayloadMessage
    | ZenohDidoErrorMessage

  interface ZenohHardwareDiagnosticsStartOptions {
    host: string
    topics: string[]
  }

  interface ZenohHardwareDiagnosticsStatusMessage {
    type: 'status'
    state: string
    endpoint?: string
    keys?: string[]
    reused?: boolean
    code?: number | null
    signal?: string | null
  }

  interface ZenohHardwareDiagnosticsPayloadMessage extends FleetDiagnosticStateMessage {
    type: 'hardware-diagnostics'
    key: string
    namespace: string
  }

  interface ZenohHardwareDiagnosticsErrorMessage {
    type: 'error' | 'decode-error' | 'log'
    message?: string
    key?: string
    byteLength?: number
  }

  type ZenohHardwareDiagnosticsMessage =
    | ZenohHardwareDiagnosticsStatusMessage
    | ZenohHardwareDiagnosticsPayloadMessage
    | ZenohHardwareDiagnosticsErrorMessage

  interface ZenohBondsStartOptions {
    host: string
    topics: string[]
  }

  interface ZenohBondsStatusMessage {
    type: 'status'
    state: string
    endpoint?: string
    keys?: string[]
    reused?: boolean
    code?: number | null
    signal?: string | null
  }

  interface ZenohBondPayloadMessage extends BondStatusMessage {
    type: 'bond'
    key: string
    namespace: string
  }

  interface ZenohBondsErrorMessage {
    type: 'error' | 'decode-error' | 'log'
    message?: string
    key?: string
    byteLength?: number
  }

  type ZenohBondsMessage =
    | ZenohBondsStatusMessage
    | ZenohBondPayloadMessage
    | ZenohBondsErrorMessage

  interface ZenohLifecycleTransitionStartOptions {
    host: string
    namespace: string
    topics: string[]
  }

  interface LifecycleTransitionState {
    id: number
    label: string
  }

  interface ZenohLifecycleTransitionStatusMessage {
    type: 'status'
    state: string
    endpoint?: string
    keys?: string[]
    reused?: boolean
    code?: number | null
    signal?: string | null
  }

  interface ZenohLifecycleTransitionPayloadMessage {
    type: 'transition-event'
    key: string
    stamp: {
      sec: number
      nanosec: number
    }
    transition: LifecycleTransitionState
    startState: LifecycleTransitionState
    goalState: LifecycleTransitionState
  }

  interface ZenohLifecycleTransitionErrorMessage {
    type: 'error' | 'decode-error' | 'log'
    message?: string
    key?: string
    byteLength?: number
  }

  type ZenohLifecycleTransitionMessage =
    | ZenohLifecycleTransitionStatusMessage
    | ZenohLifecycleTransitionPayloadMessage
    | ZenohLifecycleTransitionErrorMessage

  interface ZenohFleetVelocityCommandOptions {
    host: string
    topic: string
    command?: TwistCommand
  }

  interface ZenohFleetDigitalOutputCommandOptions {
    host: string
    servicePath: string
    address: number
    value: boolean
    requestId: string
    controlId?: string
  }

  interface ZenohTaskListOptions {
    host: string
    servicePath?: string
    robotNameFilter?: string
    timeoutMs?: number
  }

  interface ZenohTaskListResult {
    ok: boolean
    type: 'service-response'
    service: 'list_tasks'
    key: string
    requestId: string
    success: boolean
    message: string
    tasks: TaskManagerTaskInfo[]
  }

  interface ZenohActionListOptions {
    host: string
    servicePath?: string
    timeoutMs?: number
  }

  interface ZenohActionListResult extends TaskManagerListActionsResult {
    type: 'service-response'
    service: 'list_actions'
    key: string
    requestId: string
    success: boolean
  }

  interface ZenohTaskDetailOptions {
    host: string
    servicePath?: string
    taskId: string
    timeoutMs?: number
  }

  interface ZenohTaskDetailResult extends TaskManagerTaskDetail {
    ok: boolean
    type: 'service-response'
    service: 'get_task'
    key: string
    requestId: string
    success: boolean
  }

  interface ZenohTaskCreateOptions {
    host: string
    servicePath?: string
    task: TaskManagerCreateTaskPayload
    timeoutMs?: number
  }

  interface ZenohTaskCreateResult extends TaskManagerCreateTaskResult {
    type: 'service-response'
    service: 'create_task'
    key: string
    requestId: string
    success: boolean
  }

  interface ZenohTaskRunOptions {
    host: string
    servicePath?: string
    taskId: string
    timeoutMs?: number
  }

  interface ZenohTaskRunResult extends TaskManagerRunTaskResult {
    type: 'service-response'
    service: 'run_task'
    key: string
    requestId: string
    success: boolean
  }

  interface ZenohTaskCancelOptions {
    host: string
    servicePath?: string
    taskId: string
    timeoutMs?: number
  }

  interface ZenohTaskCancelResult extends TaskManagerCancelTaskResult {
    type: 'service-response'
    service: 'cancel_task'
    key: string
    requestId: string
    success: boolean
  }

  interface ZenohTaskDeleteOptions {
    host: string
    servicePath?: string
    taskId: string
    force?: boolean
    timeoutMs?: number
  }

  interface ZenohTaskDeleteResult extends TaskManagerDeleteTaskResult {
    type: 'service-response'
    service: 'delete_task'
    key: string
    requestId: string
    success: boolean
  }

  interface ZenohStorageReinitOptions {
    host: string
    servicePath?: string
    request: StorageReinitRequestPayload
    timeoutMs?: number
  }

  interface ZenohStorageAreaDisplayNameOptions {
    host: string
    servicePath?: string
    areaIndex: number
    displayName: string
    timeoutMs?: number
  }

  interface ZenohStorageAreaDisplayNameResult extends StorageAreaDisplayNameResult {
    ok: boolean
    type: 'service-response'
    service: 'set_area_display_name'
    key: string
    requestId: string
    received?: boolean
  }

  interface ZenohStorageReinitResult extends StorageReinitResult {
    ok: boolean
    type: 'service-response'
    service: 'reinit_storage'
    key: string
    requestId: string
    received?: boolean
  }

  interface ZenohPointCloudRoiRequest {
    min_x: number
    max_x: number
    min_y: number
    max_y: number
    min_z: number
    max_z: number
    remove_ground: boolean
    ground_plane_a: number
    ground_plane_b: number
    ground_plane_c: number
    ground_plane_d: number
    ground_distance_threshold: number
  }

  interface ZenohPointCloudRoiOptions {
    host: string
    namespace: string
    cameraName: string
    servicePath?: string
    request: ZenohPointCloudRoiRequest
    timeoutMs?: number
    maxPoints?: number
  }

  interface ZenohPointCloudRoiResult {
    ok: boolean
    type: 'service-response'
    service: 'get_point_cloud_roi'
    key: string
    requestId: string
    success: boolean
    message: string
    pointCloud: PointCloudMessage
  }

  interface ZenohFleetLiftRequestCommandOptions {
    host: string
    topic: string
    request: RmfLiftRequestMessage
  }

  interface ZenohFleetDoorRequestCommandOptions {
    host: string
    topic: string
    request: RmfDoorRequestMessage
  }

  interface ZenohCommandStatusMessage {
    type: 'status'
    state: string
    endpoint?: string
    code?: number | null
    signal?: string | null
  }

  interface ZenohCommandPublishedMessage {
    type: 'published'
    key: string
  }

  interface ZenohCommandWriteCoilServiceResponseMessage {
    type: 'service-response'
    service: 'write_coil'
    key: string
    requestId: string
    controlId?: string
    address: number
    value: boolean
    success: boolean
    message: string
  }

  interface ZenohCommandListTasksServiceResponseMessage {
    type: 'service-response'
    service: 'list_tasks'
    key: string
    requestId: string
    success: boolean
    message: string
    tasks: TaskManagerTaskInfo[]
  }

  interface ZenohCommandListActionsServiceResponseMessage extends TaskManagerListActionsResult {
    type: 'service-response'
    service: 'list_actions'
    key: string
    requestId: string
    success: boolean
  }

  interface ZenohCommandGetTaskServiceResponseMessage extends TaskManagerTaskDetail {
    type: 'service-response'
    service: 'get_task'
    key: string
    requestId: string
    success: boolean
  }

  interface ZenohCommandCreateTaskServiceResponseMessage extends TaskManagerCreateTaskResult {
    type: 'service-response'
    service: 'create_task'
    key: string
    requestId: string
    success: boolean
  }

  interface ZenohCommandRunTaskServiceResponseMessage extends TaskManagerRunTaskResult {
    type: 'service-response'
    service: 'run_task'
    key: string
    requestId: string
    success: boolean
  }

  interface ZenohCommandCancelTaskServiceResponseMessage extends TaskManagerCancelTaskResult {
    type: 'service-response'
    service: 'cancel_task'
    key: string
    requestId: string
    success: boolean
  }

  interface ZenohCommandDeleteTaskServiceResponseMessage extends TaskManagerDeleteTaskResult {
    type: 'service-response'
    service: 'delete_task'
    key: string
    requestId: string
    success: boolean
  }

  interface ZenohCommandReinitStorageServiceResponseMessage extends StorageReinitResult {
    type: 'service-response'
    service: 'reinit_storage'
    key: string
    requestId: string
    received?: boolean
  }

  interface ZenohCommandStorageAreaDisplayNameServiceResponseMessage extends StorageAreaDisplayNameResult {
    type: 'service-response'
    service: 'set_area_display_name'
    key: string
    requestId: string
    received?: boolean
  }

  interface ZenohCommandPointCloudRoiServiceResponseMessage {
    type: 'service-response'
    service: 'get_point_cloud_roi'
    key: string
    requestId: string
    success: boolean
    message: string
    pointCloud: PointCloudMessage | null
  }

  type ZenohCommandServiceResponseMessage =
    | ZenohCommandWriteCoilServiceResponseMessage
    | ZenohCommandListTasksServiceResponseMessage
    | ZenohCommandListActionsServiceResponseMessage
    | ZenohCommandGetTaskServiceResponseMessage
    | ZenohCommandCreateTaskServiceResponseMessage
    | ZenohCommandRunTaskServiceResponseMessage
    | ZenohCommandCancelTaskServiceResponseMessage
    | ZenohCommandDeleteTaskServiceResponseMessage
    | ZenohCommandStorageAreaDisplayNameServiceResponseMessage
    | ZenohCommandReinitStorageServiceResponseMessage
    | ZenohCommandPointCloudRoiServiceResponseMessage

  interface ZenohCommandErrorMessage {
    type: 'error' | 'log'
    message?: string
    key?: string
  }

  type ZenohCommandMessage =
    | ZenohCommandStatusMessage
    | ZenohCommandPublishedMessage
    | ZenohCommandServiceResponseMessage
    | ZenohCommandErrorMessage

  interface CameraGatewayRequestOptions {
    host: string
    port?: number
    path: string
    method?: 'GET' | 'POST'
  }

  interface CameraGatewayRequestResult<T = unknown> {
    ok: boolean
    status: number
    body: T
  }

  interface ComposeControlRequestOptions {
    host: string
    port?: number
    path: string
    method?: 'GET' | 'PUT' | 'POST'
    token?: string
    json?: unknown
  }

  interface ComposeControlRequestResult<T = unknown> {
    ok: boolean
    status: number
    body: T
  }

  interface CameraGatewayBinaryResult {
    ok: boolean
    status: number
    contentType: string
    data: string
  }

  interface ModbusShelfStateOptions {
    host: string
    port?: number
    unitId?: number
    timeoutMs?: number
  }

  interface ModbusShelfStateWriteOptions extends ModbusShelfStateOptions {
    state: Pick<ShelfState, 'shelf_present' | 'stock' | 'lift_enabled' | 'lift_target_height'>
  }

  interface ModbusShelfStateResult {
    ok: boolean
    state: ShelfState
    meta: {
      host: string
      port: number
      unitId: number
      timeoutMs: number
    }
  }

  interface ModbusCoilOptions extends ModbusShelfStateOptions {
    address: number
  }

  interface ModbusCoilWriteOptions extends ModbusCoilOptions {
    value: boolean
  }

  interface ModbusCoilWriteStep {
    address: number
    value: boolean
  }

  interface ModbusCoilSequenceWriteOptions extends ModbusShelfStateOptions {
    steps: ModbusCoilWriteStep[]
  }

  interface ModbusCoilResult {
    ok: boolean
    address: number
    value: boolean
    meta: {
      host: string
      port: number
      unitId: number
      timeoutMs: number
    }
  }

  interface ModbusCoilSequenceResult {
    ok: boolean
    steps: ModbusCoilWriteStep[]
    state: ShelfState
    meta: {
      host: string
      port: number
      unitId: number
      timeoutMs: number
    }
  }

  interface Window {
    zcDesktop?: {
      isDesktop: boolean
      platform: string
      startZenohRobotPose: (options: ZenohRobotPoseStartOptions) => Promise<{ ok: boolean }>
      stopZenohRobotPose: () => Promise<{ ok: boolean }>
      onZenohRobotPose: (callback: (message: ZenohRobotPoseMessage) => void) => () => void
      startZenohPointCloud: (options: ZenohPointCloudStartOptions) => Promise<{ ok: boolean }>
      stopZenohPointCloud: () => Promise<{ ok: boolean }>
      onZenohPointCloud: (callback: (message: ZenohPointCloudMessage) => void) => () => void
      startZenohTelemetry: (options: ZenohTelemetryStartOptions) => Promise<{ ok: boolean }>
      stopZenohTelemetry: () => Promise<{ ok: boolean }>
      publishZenohVelocityCommand: (command?: TwistCommand) => Promise<{ ok: boolean }>
      publishZenohActuatorReset: () => Promise<{ ok: boolean }>
      onZenohTelemetry: (callback: (message: ZenohTelemetryMessage) => void) => () => void
      startZenohMotorStates: (options: ZenohMotorStatesStartOptions) => Promise<{ ok: boolean }>
      stopZenohMotorStates: () => Promise<{ ok: boolean }>
      onZenohMotorStates: (callback: (message: ZenohMotorStatesMessage) => void) => () => void
      startZenohWheelStates: (options: ZenohWheelStatesStartOptions) => Promise<{ ok: boolean }>
      stopZenohWheelStates: () => Promise<{ ok: boolean }>
      onZenohWheelStates: (callback: (message: ZenohWheelStatesMessage) => void) => () => void
      startZenohFleetData: (options: ZenohFleetDataStartOptions) => Promise<{ ok: boolean }>
      stopZenohFleetData: () => Promise<{ ok: boolean }>
      onZenohFleetData: (callback: (message: ZenohFleetDataMessage) => void) => () => void
      startZenohBuildingMap: (options: ZenohBuildingMapStartOptions) => Promise<{ ok: boolean }>
      stopZenohBuildingMap: () => Promise<{ ok: boolean }>
      onZenohBuildingMap: (callback: (message: ZenohBuildingMapMessage) => void) => () => void
      startZenohRmfState: (options: ZenohRmfStateStartOptions) => Promise<{ ok: boolean }>
      stopZenohRmfState: () => Promise<{ ok: boolean }>
      onZenohRmfState: (callback: (message: ZenohRmfStateMessage) => void) => () => void
      startZenohDido: (options: ZenohDidoStartOptions) => Promise<{ ok: boolean }>
      stopZenohDido: () => Promise<{ ok: boolean }>
      onZenohDido: (callback: (message: ZenohDidoMessage) => void) => () => void
      startZenohHardwareDiagnostics: (options: ZenohHardwareDiagnosticsStartOptions) => Promise<{ ok: boolean }>
      stopZenohHardwareDiagnostics: () => Promise<{ ok: boolean }>
      onZenohHardwareDiagnostics: (callback: (message: ZenohHardwareDiagnosticsMessage) => void) => () => void
      startZenohBonds: (options: ZenohBondsStartOptions) => Promise<{ ok: boolean }>
      stopZenohBonds: () => Promise<{ ok: boolean }>
      onZenohBonds: (callback: (message: ZenohBondsMessage) => void) => () => void
      startZenohLifecycleTransition: (options: ZenohLifecycleTransitionStartOptions) => Promise<{ ok: boolean }>
      stopZenohLifecycleTransition: () => Promise<{ ok: boolean }>
      onZenohLifecycleTransition: (callback: (message: ZenohLifecycleTransitionMessage) => void) => () => void
      publishZenohFleetVelocityCommand: (options: ZenohFleetVelocityCommandOptions) => Promise<{ ok: boolean }>
      publishZenohFleetDigitalOutputCommand: (options: ZenohFleetDigitalOutputCommandOptions) => Promise<{ ok: boolean }>
      listZenohTasks: (options: ZenohTaskListOptions) => Promise<ZenohTaskListResult>
      listZenohActions: (options: ZenohActionListOptions) => Promise<ZenohActionListResult>
      getZenohTask: (options: ZenohTaskDetailOptions) => Promise<ZenohTaskDetailResult>
      createZenohTask: (options: ZenohTaskCreateOptions) => Promise<ZenohTaskCreateResult>
      runZenohTask: (options: ZenohTaskRunOptions) => Promise<ZenohTaskRunResult>
      cancelZenohTask: (options: ZenohTaskCancelOptions) => Promise<ZenohTaskCancelResult>
      deleteZenohTask: (options: ZenohTaskDeleteOptions) => Promise<ZenohTaskDeleteResult>
      setZenohStorageAreaDisplayName: (options: ZenohStorageAreaDisplayNameOptions) => Promise<ZenohStorageAreaDisplayNameResult>
      reinitZenohStorage: (options: ZenohStorageReinitOptions) => Promise<ZenohStorageReinitResult>
      getZenohPointCloudRoi: (options: ZenohPointCloudRoiOptions) => Promise<ZenohPointCloudRoiResult>
      publishZenohFleetLiftRequest: (options: ZenohFleetLiftRequestCommandOptions) => Promise<{ ok: boolean }>
      publishZenohFleetDoorRequest: (options: ZenohFleetDoorRequestCommandOptions) => Promise<{ ok: boolean }>
      stopZenohCommand: () => Promise<{ ok: boolean }>
      onZenohCommand: (callback: (message: ZenohCommandMessage) => void) => () => void
      requestCameraGateway: <T = unknown>(options: CameraGatewayRequestOptions) => Promise<CameraGatewayRequestResult<T>>
      fetchCameraGatewayBinary: (options: CameraGatewayRequestOptions) => Promise<CameraGatewayBinaryResult>
      fetchRobotParameters: (options: { host: string; port?: number }) => Promise<{ ok: boolean; status: number; body: string }>
      fetchRobotParameterHeads: (options: { host: string; port?: number }) => Promise<{ ok: boolean; status: number; body: string }>
      fetchRobotParametersByHeads: (options: { host: string; port?: number; heads: string[] }) => Promise<{ ok: boolean; status: number; body: string }>
      updateRobotParameter: (options: { host: string; port?: number; keyPath: string; newValue: unknown; numericType?: 'integer' | 'double' }) => Promise<{ ok: boolean; status: number; body: string }>
      requestComposeControl: <T = unknown>(options: ComposeControlRequestOptions) => Promise<ComposeControlRequestResult<T>>
      readShelfStateModbus: (options: ModbusShelfStateOptions) => Promise<ModbusShelfStateResult>
      writeShelfStateModbus: (options: ModbusShelfStateWriteOptions) => Promise<ModbusShelfStateResult>
      readModbusCoil: (options: ModbusCoilOptions) => Promise<ModbusCoilResult>
      writeModbusCoil: (options: ModbusCoilWriteOptions) => Promise<ModbusCoilResult>
      writeModbusCoilSequence: (options: ModbusCoilSequenceWriteOptions) => Promise<ModbusCoilSequenceResult>
    }
  }
}

export {}
