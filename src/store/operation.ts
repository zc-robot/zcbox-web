import { Operation } from "@/types"
import { StateCreator } from "zustand"

export interface OperationSlice {
  current: Operation

  // Action
  update: (by: Operation) => void
}

export const operationSlice: StateCreator<OperationSlice> = (set, get) => ({
  current: "move",

  update: (by: Operation) => {
    set((state) => {
      return { current: by }
    })
  }
})
