import type { StateCreator } from 'zustand'
import type { GridInfoMessage, PoseMessage } from '@/types'
import { mapImageData } from '@/util/transform'

export interface GridSlice {
  scale: number
  gridInfo: GridInfoMessage | null
  mapData: number[]
  pose: PoseMessage | null

  // Actions
  setMapGrid: (data: number[], grid: GridInfoMessage) => void
  setRobotPose: (pose: PoseMessage) => void
  resetGrid: () => void
  zoom: (scale: number) => void
}

export const gridSlice: StateCreator<GridSlice> = set => ({
  scale: 1,
  gridInfo: null,
  mapData: [],
  pose: null,

  // Actions
  setMapGrid: (data, grid) => {
    set({ mapData: data, gridInfo: grid })
  },
  setRobotPose: (pose) => {
    set({ pose })
  },
  resetGrid: () => {
    set({
      scale: 2,
      gridInfo: null,
      mapData: [],
      pose: null,
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

export function selectMapImageData(state: GridSlice) {
  const { gridInfo, mapData } = state
  if (!gridInfo || !mapData)
    return null
  const data = mapImageData(gridInfo, mapData)
  return new ImageData(data, gridInfo.width, gridInfo.height)
}
