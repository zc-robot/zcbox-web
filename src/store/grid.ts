import type { StateCreator } from 'zustand'
import type { GridInfoMessage, LaserScanMessage, MapData, MapListItem, PointCloudMessage, PointMessage, PoseMessage, RobotInfoMessage, RobotStatus } from '@/types'
import { DEFAULT_LIDAR_SCAN_TOPIC, DEFAULT_LIDAR_SCAN_TOPICS, resolveLidarScanTopic } from '@/constants/lidar'

const defaultScanPointSize = 0.08
const defaultPointCloudPointSize = 0.05

interface CenterPointRequest {
  requestId: number
  x: number
  y: number
}

export interface GridSlice {
  scale: number
  maps: MapData[]
  mapsNew: MapListItem[]
  gridInfo: GridInfoMessage | null
  pathPointInfo: PointMessage[]
  mapData: number[]
  robotInfo: RobotInfoMessage | null
  laserPose: PoseMessage | null
  laserScan: LaserScanMessage | null
  laserScans: Record<string, LaserScanMessage>
  selectedLidarScanTopics: string[]
  pointCloud: PointCloudMessage | null
  pointClouds: PointCloudMessage[]
  hasLivePose: boolean
  hasLiveBattery: boolean
  livePoseSource: string | null
  liveBatterySource: string | null
  lastPoseUpdateAt: number | null
  lastBatteryUpdateAt: number | null
  zenohPoseStatus: string
  zenohTelemetryStatus: string
  isScanVisible: boolean
  scanPointSize: number
  isPointCloudVisible: boolean
  pointCloudPointSize: number
  centerRobotRequestId: number
  centerPointRequest: CenterPointRequest | null
  relocalizationPose: PoseMessage | null

  // Actions
  setMaps: (maps: MapData[]) => void
  setMapsNew: (maps: MapListItem[]) => void
  setMapGrid: (data: number[], grid: GridInfoMessage) => void
  setPathPointInfo: (points: PointMessage[]) => void
  setRobotInfo: (robot: RobotInfoMessage) => void
  updateRobotFsm: (fsm: RobotStatus) => void
  updateLocalizationQuality: (quality: number) => void
  updateRobotPose: (pose: PoseMessage, source?: string) => void
  updateRobotBattery: (battery: number, batteryCurrent: number, source?: string) => void
  updateZenohPoseStatus: (status: string) => void
  updateZenohTelemetryStatus: (status: string) => void
  updateLaserPose: (pose: PoseMessage) => void
  updateLaserScan: (scan: LaserScanMessage, sourceTopic?: string) => void
  setSelectedLidarScanTopics: (topics: string[]) => void
  updatePointCloud: (cloud: PointCloudMessage) => void
  setScanVisibility: (visible: boolean) => void
  updateScanPointSize: (delta: number) => void
  setPointCloudVisibility: (visible: boolean) => void
  updatePointCloudPointSize: (delta: number) => void
  requestCenterRobot: () => void
  requestCenterPoint: (point: { x: number; y: number }) => void
  beginRelocalization: () => void
  updateRelocalizationPose: (pose: PoseMessage) => void
  cancelRelocalization: () => void
  resetGrid: () => void
  zoom: (scale: number) => void
}

function clonePose(pose: PoseMessage): PoseMessage {
  return {
    position: { ...pose.position },
    orientation: { ...pose.orientation },
    pyr: { ...pose.pyr },
  }
}

function createDefaultRobotInfo(pose?: PoseMessage): RobotInfoMessage {
  return {
    pose: pose ?? {
      position: {
        x: 0,
        y: 0,
        z: 0,
      },
      orientation: {
        x: 0,
        y: 0,
        z: 0,
        w: 1,
      },
      pyr: {
        pitch: 0,
        roll: 0,
        yaw: 0,
      },
    },
    fsm: 'idle',
    localization_quality: 0,
    task_uid: '',
    battery: 0,
    batteryCurrent: 0,
  }
}

function getPointCloudTopic(pointCloud: PointCloudMessage) {
  return pointCloud.topic || pointCloud.key || pointCloud.frameId
}

export const gridSlice: StateCreator<GridSlice> = (set, get) => ({
  scale: 2,
  maps: [],
  mapsNew: [],
  gridInfo: null,
  pathPointInfo: [],
  mapData: [],
  robotInfo: null,
  laserPose: null,
  laserScan: null,
  laserScans: {},
  selectedLidarScanTopics: [DEFAULT_LIDAR_SCAN_TOPIC],
  pointCloud: null,
  pointClouds: [],
  hasLivePose: false,
  hasLiveBattery: false,
  livePoseSource: null,
  liveBatterySource: null,
  lastPoseUpdateAt: null,
  lastBatteryUpdateAt: null,
  zenohPoseStatus: 'idle',
  zenohTelemetryStatus: 'idle',
  isScanVisible: false,
  scanPointSize: defaultScanPointSize,
  isPointCloudVisible: false,
  pointCloudPointSize: defaultPointCloudPointSize,
  centerRobotRequestId: 0,
  centerPointRequest: null,
  relocalizationPose: null,

  // Actions
  setMaps: (maps) => {
    set({ maps })
  },
  setMapsNew: (mapsNew) => {
    set({ mapsNew })
  },
  setMapGrid: (data, grid) => {
    set({ mapData: data, gridInfo: grid })
  },
  setPathPointInfo: (points) => {
    set({ pathPointInfo: points })
  },
  setRobotInfo: (robot) => {
    set(state => ({
      robotInfo: state.robotInfo
        ? {
            ...robot,
            pose: state.hasLivePose ? state.robotInfo.pose : robot.pose,
            battery: state.hasLiveBattery ? state.robotInfo.battery : robot.battery,
            batteryCurrent: state.hasLiveBattery ? state.robotInfo.batteryCurrent : (robot.batteryCurrent ?? 0),
          }
        : {
            ...createDefaultRobotInfo(),
            ...robot,
            batteryCurrent: robot.batteryCurrent ?? 0,
          },
    }))
  },
  updateRobotFsm: (fsm) => {
    set(state => ({
      robotInfo: state.robotInfo
        ? { ...state.robotInfo, fsm }
        : {
            ...createDefaultRobotInfo(),
            fsm,
          },
    }))
  },
  updateLocalizationQuality: (quality) => {
    set(state => ({
      robotInfo: state.robotInfo
        ? { ...state.robotInfo, localization_quality: quality }
        : {
            ...createDefaultRobotInfo(),
            localization_quality: quality,
          },
    }))
  },
  updateRobotPose: (pose, source) => {
    set(state => ({
      hasLivePose: true,
      livePoseSource: source ?? state.livePoseSource,
      lastPoseUpdateAt: Date.now(),
      robotInfo: state.robotInfo
        ? { ...state.robotInfo, pose }
        : createDefaultRobotInfo(pose),
    }))
  },
  updateRobotBattery: (battery, batteryCurrent, source) => {
    set(state => ({
      hasLiveBattery: true,
      liveBatterySource: source ?? state.liveBatterySource,
      lastBatteryUpdateAt: Date.now(),
      robotInfo: state.robotInfo
        ? { ...state.robotInfo, battery, batteryCurrent }
        : {
            ...createDefaultRobotInfo(),
            battery,
            batteryCurrent,
          },
    }))
  },
  updateZenohPoseStatus: (status) => {
    set({ zenohPoseStatus: status })
  },
  updateZenohTelemetryStatus: (status) => {
    set({ zenohTelemetryStatus: status })
  },
  updateLaserPose: (pose) => {
    set({ laserPose: pose })
  },
  updateLaserScan: (scan, sourceTopic) => {
    const topic = resolveLidarScanTopic(scan.topic ?? sourceTopic ?? scan.key)
    const nextScan = {
      ...scan,
      key: scan.key ?? sourceTopic,
      topic,
    }

    set(state => ({
      laserScan: nextScan,
      laserScans: {
        ...state.laserScans,
        [topic]: nextScan,
      },
    }))
  },
  setSelectedLidarScanTopics: (topics) => {
    const selected = DEFAULT_LIDAR_SCAN_TOPICS.filter(topic => topics.includes(topic))
    const nextTopics = selected.length > 0 ? selected : [DEFAULT_LIDAR_SCAN_TOPIC]

    set(state => ({
      selectedLidarScanTopics: nextTopics,
      laserScans: Object.fromEntries(
        Object.entries(state.laserScans).filter(([topic]) => nextTopics.includes(topic)),
      ),
    }))
  },
  updatePointCloud: (pointCloud) => {
    set((state) => {
      const topic = getPointCloudTopic(pointCloud)
      const pointClouds = [
        ...state.pointClouds.filter(cloud => getPointCloudTopic(cloud) !== topic),
        pointCloud,
      ].slice(-8)

      return {
        pointCloud,
        pointClouds,
      }
    })
  },
  setScanVisibility: (visible) => {
    if (visible) {
      set({ isScanVisible: true })
      return
    }

    set({
      isScanVisible: false,
      laserPose: null,
      laserScan: null,
      laserScans: {},
    })
  },
  updateScanPointSize: (delta) => {
    set(state => ({
      scanPointSize: Math.min(0.3, Math.max(0.01, Number((state.scanPointSize + delta).toFixed(3)))),
    }))
  },
  setPointCloudVisibility: (visible) => {
    if (visible) {
      set({ isPointCloudVisible: true })
      return
    }

    set({
      isPointCloudVisible: false,
      pointCloud: null,
      pointClouds: [],
    })
  },
  updatePointCloudPointSize: (delta) => {
    set(state => ({
      pointCloudPointSize: Math.min(0.3, Math.max(0.01, Number((state.pointCloudPointSize + delta).toFixed(3)))),
    }))
  },
  requestCenterRobot: () => {
    set(state => ({
      centerRobotRequestId: state.centerRobotRequestId + 1,
    }))
  },
  requestCenterPoint: (point) => {
    set(state => ({
      centerPointRequest: {
        requestId: (state.centerPointRequest?.requestId ?? 0) + 1,
        x: point.x,
        y: point.y,
      },
    }))
  },
  beginRelocalization: () => {
    const pose = get().robotInfo?.pose
    set({
      relocalizationPose: pose ? clonePose(pose) : clonePose(createDefaultRobotInfo().pose),
    })
  },
  updateRelocalizationPose: (pose) => {
    set({ relocalizationPose: clonePose(pose) })
  },
  cancelRelocalization: () => {
    set({ relocalizationPose: null })
  },
  resetGrid: () => {
    set({
      scale: 2,
      gridInfo: null,
      pathPointInfo: [],
      mapData: [],
      robotInfo: null,
      laserPose: null,
      laserScan: null,
      laserScans: {},
      selectedLidarScanTopics: [DEFAULT_LIDAR_SCAN_TOPIC],
      pointCloud: null,
      pointClouds: [],
      hasLivePose: false,
      hasLiveBattery: false,
      livePoseSource: null,
      liveBatterySource: null,
      lastPoseUpdateAt: null,
      lastBatteryUpdateAt: null,
      zenohPoseStatus: 'idle',
      zenohTelemetryStatus: 'idle',
      isScanVisible: false,
      scanPointSize: defaultScanPointSize,
      isPointCloudVisible: false,
      pointCloudPointSize: defaultPointCloudPointSize,
      centerPointRequest: null,
      relocalizationPose: null,
    })
  },
  zoom: (scale: number) => {
    set((state) => {
      const newScale = state.scale * scale
      if (newScale > 10 || newScale < 0.1)
        return state
      return { scale: newScale }
    })
  },
})
