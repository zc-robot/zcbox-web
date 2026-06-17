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

// 自定义状态净化函数，用于处理大型地图数据
function stateSanitizer(state: any) {
  // 如果状态中包含大型地图数据，则用占位符替换
  if (state.mapData && state.mapData.length > 1000000) {
    return {
      ...state,
      mapData: `<<LARGE_MAP_DATA: ${state.mapData.length} elements>>`,
    }
  }
  return state
}

export const useBoundStore = create<GridSlice & OperationSlice & ProfileSlice & ParamsSlice>()(persist(
  devtools(
    (...a) => ({
      ...gridSlice(...a),
      ...profileSlice(...a),
      ...operationSlice(...a),
      ...paramsSlice(...a),
    }),
    {
      // 配置devtools，添加状态净化功能
      stateSanitizer,
    },
  ),
  {
    name: 'zc-web',
    partialize: state => ({
      language: state.language,
      apiDomain: state.apiDomain,
      wsDomain: state.wsDomain,
      isGetDomainAuto: state.isGetDomainAuto,
      nestControllerIp: state.nestControllerIp,
      nestControllerHistory: state.nestControllerHistory,
      pointCloudTopics: state.pointCloudTopics,
      robotParams: state.robotParams,
      mapParams: state.mapParams,
    }),
  },
))

export function useGridStore<T>(selector?: (state: GridSlice) => T,
  equals?: (a: T, b: T) => boolean) {
  return useBoundStore(selector!, equals)
}

// 获取地图数据但不触发Redux DevTools序列化
export function useMapDataOnly() {
  return useBoundStore.getState().mapData
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
