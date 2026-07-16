import type { StateCreator } from 'zustand'
import type { AppMode, FootprintParams, JointParams, LanguageCode, PointAction, RobotParams } from '@/types'
import { UNKNOWN_ROBOT_NAME, bindConnectionHistory } from '@/util/robotConnection'
import type { ConnectionHostHistoryEntry } from '@/util/robotConnection'

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
  robotName: string
  connectionHostHistory: ConnectionHostHistoryEntry[]
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
  rememberConnectionHost: (ip: string, robotName: string, preserveExistingName?: boolean) => void
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
  robotName: UNKNOWN_ROBOT_NAME,
  connectionHostHistory: [],
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
  rememberConnectionHost: (ip: string, robotName: string, preserveExistingName = false) => {
    const normalizedIp = ip.trim()

    set((state) => {
      if (!normalizedIp)
        return state

      return {
        nestControllerIp: normalizedIp,
        robotName: robotName.trim() || UNKNOWN_ROBOT_NAME,
        connectionHostHistory: bindConnectionHistory(state.connectionHostHistory, normalizedIp, robotName, {
          preserveExistingName,
        }),
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
      robotName: UNKNOWN_ROBOT_NAME,
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
