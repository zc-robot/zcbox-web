import type { PointCloudMessage, PoseMessage } from './types'

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
    code?: number | null
    signal?: string | null
  }

  interface ZenohRobotPosePayloadMessage {
    type: 'pose'
    key: string
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
    maxPoints?: number
    minIntervalMs?: number
  }

  interface ZenohPointCloudStatusMessage {
    type: 'status'
    state: string
    endpoint?: string
    key?: string
    keys?: string[]
    code?: number | null
    signal?: string | null
  }

  interface ZenohPointCloudPayloadMessage extends PointCloudMessage {
    type: 'pointcloud'
    key: string
    topic: string
  }

  interface ZenohPointCloudErrorMessage {
    type: 'error' | 'decode-error' | 'log'
    message?: string
    key?: string
    byteLength?: number
  }

  type ZenohPointCloudMessage = ZenohPointCloudStatusMessage | ZenohPointCloudPayloadMessage | ZenohPointCloudErrorMessage

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
    }
  }
}

export {}
