import { GridInfoMessage, PoseMessage } from "@/types"
import { demoPoseMsg, mapMsg } from "./demo"
import { mapImageData } from "@/util/transform"
import { StateCreator } from "zustand"
import apiServer from "@/service/apiServer"

export interface GridSlice {
  scale: number,
  gridInfo: GridInfoMessage | null,
  mapData: number[],
  pose: PoseMessage | null,

  // Actions
  fetchMapGrid: () => Promise<void>,
  fetchRobotPose: () => Promise<void>,
  zoom: (scale: number) => void,
}

export const gridSlice: StateCreator<GridSlice> = (set) => ({
  scale: 2,
  gridInfo: mapMsg.info,
  mapData: mapMsg.data,
  pose: demoPoseMsg,
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
      if (newScale > 3 || newScale < 0.5) return state
      return { scale: newScale }
    })
  },
})

export const selectMapImageData = (state: GridSlice) => {
  const { gridInfo, mapData } = state
  if (!gridInfo) return null
  const data = mapImageData(gridInfo, mapData)
  return new ImageData(new Uint8ClampedArray(data), gridInfo.width, gridInfo.height)
}
