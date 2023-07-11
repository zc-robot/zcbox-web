import type { StateCreator } from 'zustand'
import type { GridInfoMessage, MapData, RobotInfoMessage } from '@/types'

export interface GridSlice {
  scale: number
  maps: MapData[]
  gridInfo: GridInfoMessage | null
  mapData: number[]
  robotInfo: RobotInfoMessage | null

  // Actions
  setMaps: (maps: MapData[]) => void
  setMapGrid: (data: number[], grid: GridInfoMessage) => void
  setRobotInfo: (robot: RobotInfoMessage) => void
  resetGrid: () => void
  zoom: (scale: number) => void
}

export const gridSlice: StateCreator<GridSlice> = set => ({
  scale: 2,
  maps: [],
  gridInfo: null,
  mapData: [],
  robotInfo: null,

  // Actions
  setMaps: (maps) => {
    set({ maps })
  },
  setMapGrid: (data, grid) => {
    set({ mapData: data, gridInfo: grid })
  },
  setRobotInfo: (robot) => {
    set({ robotInfo: robot })
  },
  resetGrid: () => {
    set({
      scale: 2,
      gridInfo: null,
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
