import type { StateCreator } from 'zustand'
import type { GridInfoMessage, PoseMessage } from '@/types'
import { mapImageData } from '@/util/transform'
import apiServer from '@/service/apiServer'

export interface GridSlice {
  scale: number
  gridInfo: GridInfoMessage | null
  mapData: number[]
  pose: PoseMessage | null

  // Actions
  fetchMapGrid: () => Promise<void>
  fetchRobotPose: () => Promise<void>
  zoom: (scale: number) => void
}

export const gridSlice: StateCreator<GridSlice> = set => ({
  scale: 2,
  gridInfo: null,
  mapData: [],
  pose: null,
  wayPoints: [],

  fetchMapGrid: async () => {
    const msg = await apiServer.fetchMap()
    set({
      gridInfo: msg.info,
      mapData: msg.data,
    })
  },
  fetchRobotPose: async () => {
    const msg = await apiServer.fetchRobotData()
    set({
      pose: msg.robot_pose,
    })
  },
  zoom: (scale: number) => {
    set((state) => {
      const newScale = state.scale * scale
      if (newScale > 3 || newScale < 0.5)
        return state
      return { scale: newScale }
    })
  },
})

export function selectMapImageData(state: GridSlice) {
  const { gridInfo, mapData } = state
  if (!gridInfo)
    return null
  const data = mapImageData(gridInfo, mapData)
  return new ImageData(data, gridInfo.width, gridInfo.height)
}
