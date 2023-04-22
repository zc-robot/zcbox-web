import { MapMetaDataMessage, OccupancyGridMessage, PoseMessage } from "@/types"
import { demoPoseMsg, mapMsg } from "./demo"
import { mapImageData } from "@/util/transform"
import { create, useStore } from "zustand"

interface GridSlice {
  scale: number,
  gridInfo: MapMetaDataMessage | null,
  mapData: number[],
  pose: PoseMessage | null,

  // Actions
  updateGrid: (grid: OccupancyGridMessage | null) => void,
  updatePose: (pose: PoseMessage | null) => void,
  zoom: (scale: number) => void,
}

const gridSlice = create<GridSlice>((set) => ({
  scale: 2,
  gridInfo: mapMsg.info,
  mapData: mapMsg.data,
  pose: demoPoseMsg,
  wayPoints: [],

  updateGrid: (grid: OccupancyGridMessage | null) => {
    set({
      gridInfo: grid?.info || null,
      mapData: grid?.data || []
    })
  },
  updatePose: (pose: PoseMessage | null) => {
    set({ pose })
  },
  zoom: (scale: number) => {
    set((state) => {
      const newScale = state.scale * scale
      if (newScale > 2 || newScale < 0.5) return state
      return { scale: newScale }
    })
  },
}))

export const selectMapImageData = (state: GridSlice) => {
  const { gridInfo, mapData } = state
  if (!gridInfo) return null
  const data = mapImageData(gridInfo, mapData)
  return new ImageData(new Uint8ClampedArray(data), gridInfo.width, gridInfo.height)
}

const useGridStore = <T>(
  selector?: (state: GridSlice) => T,
  equals?: (a: T, b: T) => boolean
) => {
  return useStore(gridSlice, selector!, equals)
}

export default useGridStore
