import type { StateCreator } from 'zustand'
import type { Operation } from '@/types'

export interface OperationSlice {
  current: Operation
  selectedPointId: string | null
  selectedPointIds: string[]
  editingPointId: string | null
  velocityInfo: {
    line: number
    angular: number
  }

  // Action
  updateOp: (by: Operation) => void
  selectPoint: (id: string | null) => void
  selectPoints: (ids: string[], primaryId?: string | null) => void
  togglePointSelection: (id: string) => void
  openPointEditor: (id: string | null) => void
  updateLineVelocity: (by: number) => void
  updateAngularVelocity: (by: number) => void
}

function normalizePointIds(ids: string[]) {
  return Array.from(new Set(ids.filter(id => id.startsWith('Point'))))
}

export const operationSlice: StateCreator<OperationSlice> = (set, get) => ({
  current: 'move',
  selectedPointId: null,
  selectedPointIds: [],
  editingPointId: null,
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
      if (!id)
        return { selectedPointId: null, selectedPointIds: [] }

      if (id.startsWith('Point'))
        return { selectedPointId: id, selectedPointIds: [id] }

      return { selectedPointId: id, selectedPointIds: [] }
    })
  },
  selectPoints: (ids: string[], primaryId?: string | null) => {
    set(() => {
      const nextIds = normalizePointIds(ids)
      const nextPrimary = nextIds.length === 0
        ? null
        : nextIds.includes(primaryId ?? '')
          ? primaryId ?? null
          : nextIds[nextIds.length - 1]

      return {
        selectedPointId: nextPrimary,
        selectedPointIds: nextIds,
      }
    })
  },
  togglePointSelection: (id: string) => {
    set((state) => {
      const exists = state.selectedPointIds.includes(id)
      const nextIds = exists
        ? state.selectedPointIds.filter(item => item !== id)
        : normalizePointIds([...state.selectedPointIds, id])

      const nextPrimary = nextIds.length === 0
        ? null
        : exists
          ? state.selectedPointId === id
            ? nextIds[nextIds.length - 1]
            : state.selectedPointId
          : id

      return {
        selectedPointId: nextPrimary,
        selectedPointIds: nextIds,
      }
    })
  },
  openPointEditor: (id: string | null) => {
    set(() => {
      return { editingPointId: id }
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
