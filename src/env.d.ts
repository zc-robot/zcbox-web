import type { ShelfState } from './service/apiServer'
import type { BuildingMapMessage, FleetDataMessage, FleetDiagnosticStateMessage, LaserScanMessage, MotorStatesMessage, PointCloudMessage, PoseMessage, TwistCommand, UInt8MultiArrayMessage } from './types'

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

  interface ZenohCommandServiceResponseMessage {
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
      startZenohFleetData: (options: ZenohFleetDataStartOptions) => Promise<{ ok: boolean }>
      stopZenohFleetData: () => Promise<{ ok: boolean }>
      onZenohFleetData: (callback: (message: ZenohFleetDataMessage) => void) => () => void
      startZenohBuildingMap: (options: ZenohBuildingMapStartOptions) => Promise<{ ok: boolean }>
      stopZenohBuildingMap: () => Promise<{ ok: boolean }>
      onZenohBuildingMap: (callback: (message: ZenohBuildingMapMessage) => void) => () => void
      startZenohDido: (options: ZenohDidoStartOptions) => Promise<{ ok: boolean }>
      stopZenohDido: () => Promise<{ ok: boolean }>
      onZenohDido: (callback: (message: ZenohDidoMessage) => void) => () => void
      startZenohHardwareDiagnostics: (options: ZenohHardwareDiagnosticsStartOptions) => Promise<{ ok: boolean }>
      stopZenohHardwareDiagnostics: () => Promise<{ ok: boolean }>
      onZenohHardwareDiagnostics: (callback: (message: ZenohHardwareDiagnosticsMessage) => void) => () => void
      publishZenohFleetVelocityCommand: (options: ZenohFleetVelocityCommandOptions) => Promise<{ ok: boolean }>
      publishZenohFleetDigitalOutputCommand: (options: ZenohFleetDigitalOutputCommandOptions) => Promise<{ ok: boolean }>
      stopZenohCommand: () => Promise<{ ok: boolean }>
      onZenohCommand: (callback: (message: ZenohCommandMessage) => void) => () => void
      requestCameraGateway: <T = unknown>(options: CameraGatewayRequestOptions) => Promise<CameraGatewayRequestResult<T>>
      fetchCameraGatewayBinary: (options: CameraGatewayRequestOptions) => Promise<CameraGatewayBinaryResult>
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
