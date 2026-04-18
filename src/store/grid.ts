import type { StateCreator } from 'zustand'
import type { GridInfoMessage, LaserScanMessage, MapData, MapListItem, PointMessage, PoseMessage, RobotInfoMessage } from '@/types'

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
  resetGrid: () => void
  zoom: (scale: number) => void
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

export const gridSlice: StateCreator<GridSlice> = set => ({
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
