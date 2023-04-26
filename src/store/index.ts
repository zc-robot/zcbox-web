import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { GridSlice } from './grid'
import { gridSlice } from './grid'
import type { NavigationSlice } from './navigation'
import { navigationSlice } from './navigation'
import type { OperationSlice } from './operation'
import { operationSlice } from './operation'

const useBoundStore = create<GridSlice & NavigationSlice & OperationSlice>()(devtools(
  (...a) => ({
    ...gridSlice(...a),
    ...navigationSlice(...a),
    ...operationSlice(...a),
  }),
))

export function useNavigationStore<T>(selector?: (state: NavigationSlice) => T,
  equals?: (a: T, b: T) => boolean) {
  return useBoundStore(selector!, equals)
}

export function useGridStore<T>(selector?: (state: GridSlice) => T,
  equals?: (a: T, b: T) => boolean) {
  return useBoundStore(selector!, equals)
}

export function useOperationStore<T>(selector?: (state: OperationSlice) => T,
  equals?: (a: T, b: T) => boolean) {
  return useBoundStore(selector!, equals)
}
