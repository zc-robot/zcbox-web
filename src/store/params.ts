import type { StateCreator } from 'zustand'
import type { FootprintParams, JointParams, RobotParams } from '@/types'
import apiServer from '@/service/apiServer'

export interface ParamsSlice {
  params: RobotParams | null

  // Actions
  fetchParams: () => Promise<void>
  updateJointParams: (index: number, by: JointParams) => void
  updateFootprintParams: (by: FootprintParams) => void
  uploadParams: () => Promise<void>
}

export const paramsSlice: StateCreator<ParamsSlice> = (set, get) => ({
  params: null,

  fetchParams: async () => {
    const params = await apiServer.fetchParams()
    set({ params })
  },
  updateJointParams: (index: number, by: JointParams) => {
    set((state) => {
      if (state.params) {
        const newUrdf = state.params.urdf.slice()
        newUrdf[index] = by
        return { params: { ...state.params, urdf: newUrdf } }
      }
      else { return state }
    })
  },
  updateFootprintParams: (by: FootprintParams) => {
    set((state) => {
      if (state.params)
        return { params: { ...state.params, robot_footprint: by } }
      else
        return state
    })
  },
  uploadParams: async () => {
    const { params } = get()
    if (params)
      await apiServer.uploadParams(params)
  },
})
