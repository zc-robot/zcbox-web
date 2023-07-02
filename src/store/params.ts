import type { StateCreator } from 'zustand'
import type { FootprintParams, JointParams, RobotParams } from '@/types'
import apiServer from '@/service/apiServer'

export interface ParamsSlice {
  apiDomain: string
  wsDomain: string
  robotParams: RobotParams | null
  mapParams: {
    resolution: number
    model: string
  }

  // Actions
  updateApiDomain: (domain: string) => void
  updateWsDomain: (domain: string) => void
  updateMapParams: (by: { resolution?: number; model?: string }) => void
  fetchRobotParams: () => Promise<void>
  updateJointParams: (index: number, by: JointParams) => void
  updateFootprintParams: (by: FootprintParams) => void
  uploadParams: () => Promise<void>
}

export const paramsSlice: StateCreator<ParamsSlice> = (set, get) => ({
  apiDomain: '',
  wsDomain: '',
  robotParams: null,
  mapParams: {
    resolution: 2,
    model: 'diff',
  },

  updateApiDomain: (domain: string) => {
    set({ apiDomain: domain })
  },
  updateWsDomain: (domain: string) => {
    set({ wsDomain: domain })
  },
  updateMapParams: (by: { resolution?: number; model?: string }) => {
    set((state) => {
      const newMapParams = { ...state.mapParams, ...by }
      return { mapParams: newMapParams }
    })
  },
  fetchRobotParams: async () => {
    const params = await apiServer.fetchParams()
    set({ robotParams: params })
  },
  updateJointParams: (index: number, by: JointParams) => {
    set((state) => {
      if (state.robotParams) {
        const newUrdf = state.robotParams.urdf.slice()
        newUrdf[index] = by
        return { robotParams: { ...state.robotParams, urdf: newUrdf } }
      }
      else { return state }
    })
  },
  updateFootprintParams: (by: FootprintParams) => {
    set((state) => {
      if (state.robotParams)
        return { robotParams: { ...state.robotParams, robot_footprint: by } }
      else
        return state
    })
  },
  uploadParams: async () => {
    const { robotParams: params } = get()
    if (params)
      await apiServer.uploadParams(params)
  },
})
