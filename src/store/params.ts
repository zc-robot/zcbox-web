import type { StateCreator } from 'zustand'
import type { FootprintParams, JointParams, LanguageCode, PointAction, RobotParams } from '@/types'

export interface ParamsSlice {
  language: LanguageCode
  apiDomain: string
  wsDomain: string
  robotParams: RobotParams | null
  pointActions: PointAction[]
  mapParams: {
    resolution: number
    model: string
  }

  // Actions
  updateLanguage: (language: LanguageCode) => void
  updateApiDomain: (domain: string) => void
  updateWsDomain: (domain: string) => void
  updateMapParams: (by: { resolution?: number; model?: string }) => void
  updateRobotParams: (by: RobotParams) => void
  updatePointActions: (by: PointAction[]) => void
  updateJointParams: (index: number, by: JointParams) => void
  updateFootprintParams: (by: FootprintParams) => void
}

export const paramsSlice: StateCreator<ParamsSlice> = set => ({
  language: 'zh-CN',
  apiDomain: '',
  wsDomain: '',
  robotParams: null,
  pointActions: [],
  mapParams: {
    resolution: 2,
    model: 'diff',
  },

  // Actions
  updateLanguage: (language: LanguageCode) => {
    set({ language })
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
  updateRobotParams: (by: RobotParams) => {
    set({ robotParams: by })
  },
  updatePointActions: (by: PointAction[]) => {
    set({ pointActions: by })
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
})
