import { createSlice, PayloadAction } from "@reduxjs/toolkit"
import { OccupancyGridMessage } from "src/types"
import { RootState } from "."
import { msg } from "./demo"

export interface GridState {
  message: OccupancyGridMessage | null
}

const initialState: GridState = {
  message: msg
}

export const gridSlice = createSlice({
  name: "grid",
  initialState,
  reducers: {
    updateMessage: (state, action: PayloadAction<OccupancyGridMessage | null>) => {
      state.message = action.payload
    }
  }
})

export const { updateMessage } = gridSlice.actions

export const selectGridMessage = (state: RootState) => state.grid.message

export default gridSlice.reducer
