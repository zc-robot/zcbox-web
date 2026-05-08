import type { StateCreator } from 'zustand'
import type { GridInfoMessage, LaserScanMessage, MapData, MapListItem, PointMessage, PoseMessage, RobotInfoMessage } from '@/types'

const defaultScanPointSize = 0.08

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
  hasMqttPose: boolean
  hasMqttBattery: boolean
  isScanVisible: boolean
  scanPointSize: number
  centerRobotRequestId: number
  centerPointRequest: CenterPointRequest | null
  relocalizationPose: PoseMessage | null

  // Actions
  setMaps: (maps: MapData[]) => void
  setMapsNew: (maps: MapListItem[]) => void
  setMapGrid: (data: number[], grid: GridInfoMessage) => void
  setPathPointInfo: (points: PointMessage[]) => void
  setRobotInfo: (robot: RobotInfoMessage) => void
  updateRobotPose: (pose: PoseMessage) => void
  updateRobotBattery: (battery: number, batteryCurrent: number) => void
  updateLaserPose: (pose: PoseMessage) => void
  updateLaserScan: (scan: LaserScanMessage) => void
  setScanVisibility: (visible: boolean) => void
  updateScanPointSize: (delta: number) => void
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
  hasMqttPose: false,
  hasMqttBattery: false,
  isScanVisible: false,
  scanPointSize: defaultScanPointSize,
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
            pose: state.hasMqttPose ? state.robotInfo.pose : robot.pose,
            battery: state.hasMqttBattery ? state.robotInfo.battery : robot.battery,
            batteryCurrent: state.hasMqttBattery ? state.robotInfo.batteryCurrent : (robot.batteryCurrent ?? 0),
          }
        : {
            ...createDefaultRobotInfo(),
            ...robot,
            batteryCurrent: robot.batteryCurrent ?? 0,
          },
    }))
  },
  updateRobotPose: (pose) => {
    set(state => ({
      hasMqttPose: true,
      robotInfo: state.robotInfo
        ? { ...state.robotInfo, pose }
        : createDefaultRobotInfo(pose),
    }))
  },
  updateRobotBattery: (battery, batteryCurrent) => {
    set(state => ({
      hasMqttBattery: true,
      robotInfo: state.robotInfo
        ? { ...state.robotInfo, battery, batteryCurrent }
        : {
            ...createDefaultRobotInfo(),
            battery,
            batteryCurrent,
          },
    }))
  },
  updateLaserPose: (pose) => {
    set({ laserPose: pose })
  },
  updateLaserScan: (scan) => {
    set({ laserScan: scan })
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
    })
  },
  updateScanPointSize: (delta) => {
    set(state => ({
      scanPointSize: Math.min(0.3, Math.max(0.01, Number((state.scanPointSize + delta).toFixed(3)))),
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
      hasMqttPose: false,
      hasMqttBattery: false,
      isScanVisible: false,
      scanPointSize: defaultScanPointSize,
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
