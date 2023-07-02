import type { StateCreator } from 'zustand'
import type { Operation } from '@/types'

export interface OperationSlice {
  current: Operation
  selectedPointId: string | null
  velocityInfo: {
    line: number
    angular: number
  }

  // Action
  updateOp: (by: Operation) => void
  selectPoint: (id: string | null) => void
  updateLineVelocity: (by: number) => void
  updateAngularVelocity: (by: number) => void
}

export const operationSlice: StateCreator<OperationSlice> = (set, get) => ({
  current: 'move',
  selectedPointId: null,
  velocityInfo: {
    line: 0.2,
    angular: 0.2,
  },

  updateOp: (by: Operation) => {
    set(() => {
      return { current: by }
    })
  },
  selectPoint: (id: string | null) => {
    set(() => {
      return { selectedPointId: id }
    })
  },
  updateLineVelocity: (by: number) => {
    if (by < 0)
      return
    set(() => {
      return { velocityInfo: { ...get().velocityInfo, line: by } }
    })
  },
  updateAngularVelocity: (by: number) => {
    if (by < 0)
      return
    set(() => {
      return { velocityInfo: { ...get().velocityInfo, angular: by } }
    })
  },
})
