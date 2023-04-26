import type { StateCreator } from 'zustand'
import type { Operation } from '@/types'

export interface OperationSlice {
  current: Operation

  // Action
  update: (by: Operation) => void
}

export const operationSlice: StateCreator<OperationSlice> = set => ({
  current: 'move',

  update: (by: Operation) => {
    set(() => {
      return { current: by }
    })
  },
})
