import type { StateCreator } from 'zustand'
import type { GridInfoMessage, MapData, MapListItem, PointMessage, PoseMessage, RobotInfoMessage } from '@/types'

export interface GridSlice {
  scale: number
  maps: MapData[]
  mapsNew: MapListItem[]
  gridInfo: GridInfoMessage | null
  pathPointInfo: PointMessage[]
  mapData: number[]
  robotInfo: RobotInfoMessage | null

  // Actions
  setMaps: (maps: MapData[]) => void
  setMapsNew: (maps: MapListItem[]) => void
  setMapGrid: (data: number[], grid: GridInfoMessage) => void
  setPathPointInfo: (points: PointMessage[]) => void
  setRobotInfo: (robot: RobotInfoMessage) => void
  updateRobotPose: (pose: PoseMessage) => void
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
        ? { ...robot, pose: state.robotInfo.pose }
        : robot,
    }))
  },
  updateRobotPose: (pose) => {
    set(state => ({
      robotInfo: state.robotInfo
        ? { ...state.robotInfo, pose }
        : createDefaultRobotInfo(pose),
    }))
  },
  resetGrid: () => {
    set({
      scale: 2,
      gridInfo: null,
      pathPointInfo: [],
      mapData: [],
      robotInfo: null,
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
