import type { ShelfState } from './service/apiServer'
import type { LaserScanMessage, PointCloudMessage, PoseMessage, TwistCommand } from './types'

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_DOMAIN?: string
    readonly VITE_WS_DOMAIN?: string
    readonly VITE_DESKTOP_HOST?: string
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
    | ZenohTelemetryErrorMessage

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
      onZenohTelemetry: (callback: (message: ZenohTelemetryMessage) => void) => () => void
      requestCameraGateway: <T = unknown>(options: CameraGatewayRequestOptions) => Promise<CameraGatewayRequestResult<T>>
      fetchCameraGatewayBinary: (options: CameraGatewayRequestOptions) => Promise<CameraGatewayBinaryResult>
      readShelfStateModbus: (options: ModbusShelfStateOptions) => Promise<ModbusShelfStateResult>
      writeShelfStateModbus: (options: ModbusShelfStateWriteOptions) => Promise<ModbusShelfStateResult>
      readModbusCoil: (options: ModbusCoilOptions) => Promise<ModbusCoilResult>
      writeModbusCoil: (options: ModbusCoilWriteOptions) => Promise<ModbusCoilResult>
    }
  }
}

export {}
