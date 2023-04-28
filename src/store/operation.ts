import type { StateCreator } from 'zustand'
import type { Operation } from '@/types'

export interface OperationSlice {
  current: Operation
  selectedPointId: string | null

  // Action
  updateOp: (by: Operation) => void
  selectPoint: (id: string | null) => void
}

export const operationSlice: StateCreator<OperationSlice> = set => ({
  current: 'move',
  selectedPointId: null,

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
})
