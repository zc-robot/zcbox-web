import type { StateCreator } from 'zustand'
import type { AppMode, FootprintParams, JointParams, LanguageCode, PointAction, RobotParams } from '@/types'

export const defaultPointCloudTopics = [
  '**/depth/points/filtered',
  '**/depth/points',
  '**/yolo/detections_pointcloud',
]

export interface ParamsSlice {
  language: LanguageCode
  apiDomain: string
  wsDomain: string
  isGetDomainAuto: boolean
  appMode: AppMode | null
  nestControllerIp: string
  nestControllerHistory: string[]
  pointCloudTopics: string[]
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
  updateIsGetDomainAuto: (domainAuto: boolean) => void
  updateAppMode: (mode: AppMode | null) => void
  rememberNestControllerIp: (ip: string) => void
  changeNestController: () => void
  updatePointCloudTopics: (topics: string[]) => void
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
  isGetDomainAuto: true,
  appMode: null,
  nestControllerIp: '',
  nestControllerHistory: [],
  pointCloudTopics: defaultPointCloudTopics,
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
  updateIsGetDomainAuto: (domainAuto: boolean) => {
    set({ isGetDomainAuto: domainAuto })
  },
  updateAppMode: (mode: AppMode | null) => {
    set({ appMode: mode })
  },
  rememberNestControllerIp: (ip: string) => {
    const normalizedIp = ip.trim()

    set((state) => {
      if (!normalizedIp)
        return state

      return {
        nestControllerIp: normalizedIp,
        nestControllerHistory: [
          normalizedIp,
          ...state.nestControllerHistory.filter(item => item !== normalizedIp),
        ].slice(0, 8),
      }
    })
  },
  changeNestController: () => {
    set({
      apiDomain: '',
      wsDomain: '',
      isGetDomainAuto: false,
      appMode: null,
      nestControllerIp: '',
    })
  },
  updatePointCloudTopics: (topics: string[]) => {
    const normalizedTopics = topics
      .map(topic => topic.trim())
      .filter(Boolean)
      .filter((topic, index, allTopics) => allTopics.indexOf(topic) === index)

    set({
      pointCloudTopics: normalizedTopics.length > 0
        ? normalizedTopics
        : defaultPointCloudTopics,
    })
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
