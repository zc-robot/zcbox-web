import { createSelector, createSlice, PayloadAction } from "@reduxjs/toolkit"
import { MapMetaDataMessage, OccupancyGridMessage, PoseMessage } from "src/types"
import { RootState } from "."
import { demoPoseMsg, mapMsg } from "./demo"
import { mapImageData, quaternionToAngle } from "@/util/transform"

export interface GridState {
  scale: number
  gridInfo: MapMetaDataMessage | null
  mapData: number[]
  pose: PoseMessage | null
  wayPoints: PoseMessage[]
}

const initialState = {
  scale: 1,
  gridInfo: mapMsg.info,
  mapData: mapMsg.data,
  pose: demoPoseMsg,
  wayPoints: [],
} as GridState

export const gridSlice = createSlice({
  name: "grid",
  initialState,
  reducers: {
    updateGrid: (state, action: PayloadAction<OccupancyGridMessage | null>) => {
      state.gridInfo = action.payload?.info || null
      state.mapData = action.payload?.data || []
    },
    updatePose: (state, action: PayloadAction<PoseMessage | null>) => {
      state.pose = action.payload
    },
    zoom: (state, action: PayloadAction<number>) => {
      if (state.scale > 2 || state.scale < 0.5) return
      state.scale = state.scale * action.payload
    },
    addWaypoint: (state, action: PayloadAction<{ x: number, y: number }>) => {
      let newPoints = state.wayPoints.slice()
      newPoints.push({
        position: {
          x: action.payload.x,
          y: action.payload.y,
          z: 0,
        },
        orientation: {
          x: 0,
          y: 0,
          z: 0,
          w: 1,
        }
      })
      state.wayPoints = newPoints
    }
  }
})

export const { updateGrid, updatePose, zoom, addWaypoint } = gridSlice.actions

export const selectScale = (state: RootState) => state.grid.scale
export const selectGridInfo = (state: RootState) => state.grid.gridInfo
export const selectPoseMessage = (state: RootState) => state.grid.pose
export const selectWayPoints = (state: RootState) => state.grid.wayPoints

export const selectMapImageData = createSelector(
  (state: RootState) => state.grid.gridInfo,
  (state: RootState) => state.grid.mapData,
  (info, data) => {
    if (!info) return undefined
    const mapdata = mapImageData(info, data)
    return new ImageData(new Uint8ClampedArray(mapdata), info.width, info.height)
  }
)

export default gridSlice.reducer
