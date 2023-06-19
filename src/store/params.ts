import type { StateCreator } from 'zustand'
import type { FootprintParams, JointParams, RobotParams } from '@/types'
import apiServer from '@/service/apiServer'

export interface ParamsSlice {
  apiDomain: string
  wsDomain: string
  params: RobotParams | null

  // Actions
  updateApiDomain: (domain: string) => void
  updateWsDomain: (domain: string) => void
  fetchParams: () => Promise<void>
  updateJointParams: (index: number, by: JointParams) => void
  updateFootprintParams: (by: FootprintParams) => void
  uploadParams: () => Promise<void>
}

export const paramsSlice: StateCreator<ParamsSlice> = (set, get) => ({
  apiDomain: import.meta.env.VITE_API_DOMAIN || 'http://localhost:1234',
  wsDomain: import.meta.env.VITE_WS_DOMAIN || 'ws://localhost:1234',
  params: null,

  updateApiDomain: (domain: string) => {
    set({ apiDomain: domain })
  },
  updateWsDomain: (domain: string) => {
    set({ wsDomain: domain })
  },
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
