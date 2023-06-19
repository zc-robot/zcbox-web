import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { GridSlice } from './grid'
import { gridSlice } from './grid'
import type { OperationSlice } from './operation'
import { operationSlice } from './operation'
import type { ParamsSlice } from './params'
import { paramsSlice } from './params'
import type { ProfileSlice } from './profile'
import { profileSlice } from './profile'

export const useBoundStore = create<GridSlice & OperationSlice & ProfileSlice & ParamsSlice>()(persist(
  devtools(
    (...a) => ({
      ...gridSlice(...a),
      ...profileSlice(...a),
      ...operationSlice(...a),
      ...paramsSlice(...a),
    }),
  ),
  {
    name: 'zc-web',
    partialize: state => ({
      apiDomain: state.apiDomain,
      wsDomain: state.wsDomain,
    }),
  },
))

export function useGridStore<T>(selector?: (state: GridSlice) => T,
  equals?: (a: T, b: T) => boolean) {
  return useBoundStore(selector!, equals)
}

export function useOperationStore<T>(selector?: (state: OperationSlice) => T,
  equals?: (a: T, b: T) => boolean) {
  return useBoundStore(selector!, equals)
}

export function useParamsStore<T>(selector?: (state: ParamsSlice) => T,
  equals?: (a: T, b: T) => boolean) {
  return useBoundStore(selector!, equals)
}

export function useProfileStore<T>(selector?: (state: ProfileSlice) => T,
  equals?: (a: T, b: T) => boolean) {
  return useBoundStore(selector!, equals)
}
