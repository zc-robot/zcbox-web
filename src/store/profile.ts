import type { StateCreator } from 'zustand'
import type { NavPath, NavPoint, NavProfile, NavTask, TaskPoint } from '@/types'
import { uid } from '@/util'

export interface ProfileSlice {
  profiles: NavProfile[]
  currentProfileId?: string
  currentTaskId?: string

  // Actions
  resetProfile: () => void
  filterMapProfiles: (by: number) => NavProfile[]
  addProfiles: (profiles: NavProfile[]) => void
  appendProfile: (mapId: number) => void
  setCurrentProfile: (id?: string) => void
  currentProfile: () => NavProfile | undefined
  currentProfilePoints: () => NavPoint[]
  currentProfilePaths: () => NavPath[]
  currentProfileTasks: () => NavTask[]
  removeCurrentProfile: () => void

  // Modify current profile's fields
  updateCurrentProfile: (profile: Partial<NavProfile>) => void
  appendCurrentProfilePoint: (point: NavPoint) => void
  updateCurrentProfilePoint: (pid: string, point: Partial<NavPoint>) => void
  removeCurrentProfilePoint: (pid: string) => void
  appendCurrentProfilePath: (path: NavPath) => void
  updateCurrentProfilePath: (pid: string, path: Partial<NavPath>) => void
  removeCurrentProfilePath: (pid: string) => void

  setCurrentTask: (id?: string) => void
  getCurrentTask: () => NavTask | undefined
  // Modify current profile's tasks
  appendProfileTask: () => void
  appendProfileTaskPoint: (point: NavPoint) => void
  updateProfileTaskPoint: (index: number, task: Partial<TaskPoint>) => void
  removeProfileTaskPoint: (index: number) => void
  swapProfileTaskPoints: (from: number, to: number) => void
  removeProfileTask: (id: string) => void
}

export const profileSlice: StateCreator<ProfileSlice> = (set, get) => ({
  profiles: [],
  currentProfileId: undefined,
  currentTaskId: undefined,

  resetProfile: () => {
    set({
      currentProfileId: undefined,
      currentTaskId: undefined,
    })
  },
  filterMapProfiles: (by: number) => {
    return get().profiles.filter(p => p.map_id === by)
  },
  appendProfile: (mapId: number) => {
    const id = uid('Profile')
    let currentId = get().currentProfileId
    if (!currentId)
      currentId = id

    set((state) => {
      const newProfiles = state.profiles.slice()
      newProfiles.push({
        uid: id,
        map_id: mapId,
        name: `配置 ${newProfiles.length + 1}`,
        description: '',
        data: {
          waypoints: [],
          paths: [],
        },
        tasks: [],
      })
      return {
        profiles: newProfiles,
        currentProfileId: currentId,
      }
    })
  },
  addProfiles: (profiles) => {
    set((state) => {
      if (profiles.length === 0)
        return state

      const newProfiles = state.profiles.slice()
      profiles.forEach((p) => {
        const old = newProfiles.find(op => op.uid === p.uid)
        if (old)
          Object.assign(old, p)
        else
          newProfiles.push(p)
      })
      return {
        profiles: newProfiles,
        currentProfileId: profiles[0].uid,
      }
    })
  },
  setCurrentProfile: (id?: string) => {
    if (id !== get().currentProfileId) {
      set({
        currentProfileId: id,
        currentTaskId: undefined,
      })
    }
  },
  currentProfile: () => {
    return get().profiles.find(p => p.uid === get().currentProfileId)
  },
  currentProfilePoints: () => {
    const p = get().profiles.find(p => p.uid === get().currentProfileId)
    return p ? p.data.waypoints : []
  },
  currentProfilePaths: () => {
    const p = get().profiles.find(p => p.uid === get().currentProfileId)
    return p ? p.data.paths : []
  },
  currentProfileTasks: () => {
    const p = get().profiles.find(p => p.uid === get().currentProfileId)
    return p ? p.tasks.slice() : []
  },
  updateCurrentProfile: (profile: Partial<NavProfile>) => {
    set((state) => {
      const newProfiles = state.profiles.slice()
      const p = newProfiles.find(p => p.uid === state.currentProfileId)
      if (p)
        Object.assign(p, profile)
      return { profiles: newProfiles }
    })
  },
  appendCurrentProfilePoint: (point: NavPoint) => {
    set((state) => {
      const newProfiles = state.profiles.slice()
      const p = newProfiles.find(p => p.uid === state.currentProfileId)
      if (p && p.data && p.data.waypoints)
        p.data.waypoints.push(point)
      return { profiles: newProfiles }
    })
  },
  updateCurrentProfilePoint: (pid: string, point: Partial<NavPoint>) => {
    set((state) => {
      const newProfiles = state.profiles.slice()
      const p = newProfiles.find(p => p.uid === state.currentProfileId)
      if (p && p.data && p.data.waypoints) {
        const index = p.data.waypoints.findIndex(p => p.uid === pid)
        if (index >= 0)
          Object.assign(p.data.waypoints[index], point)
      }
      return { profiles: newProfiles }
    })
  },
  removeCurrentProfilePoint: (pid: string) => {
    set((state) => {
      const newProfiles = state.profiles.slice()
      const p = newProfiles.find(p => p.uid === state.currentProfileId)
      if (p && p.data && p.data.waypoints) {
        const index = p.data.waypoints.findIndex(p => p.uid === pid)
        if (index >= 0)
          p.data.waypoints.splice(index, 1)
      }
      return { profiles: newProfiles }
    })
  },
  appendCurrentProfilePath: (path: NavPath) => {
    set((state) => {
      const newProfiles = state.profiles.slice()
      const p = newProfiles.find(p => p.uid === state.currentProfileId)
      if (p && p.data && p.data.paths)
        p.data.paths.push(path)
      return { profiles: newProfiles }
    })
  },
  updateCurrentProfilePath: (pid: string, path: Partial<NavPath>) => {
    set((state) => {
      const newProfiles = state.profiles.slice()
      const p = newProfiles.find(p => p.uid === state.currentProfileId)
      if (p && p.data && p.data.paths) {
        const index = p.data.paths.findIndex(p => p.uid === pid)
        if (index >= 0)
          Object.assign(p.data.paths[index], path)
      }
      return { profiles: newProfiles }
    })
  },
  removeCurrentProfilePath: (pid: string) => {
    set((state) => {
      const newProfiles = state.profiles.slice()
      const p = newProfiles.find(p => p.uid === state.currentProfileId)
      if (p && p.data && p.data.paths) {
        const index = p.data.paths.findIndex(p => p.uid === pid)
        if (index >= 0)
          p.data.paths.splice(index, 1)
      }
      return { profiles: newProfiles }
    })
  },
  removeCurrentProfile: () => {
    set((state) => {
      const newProfiles = state.profiles.slice()
      const index = newProfiles.findIndex(p => p.uid === state.currentProfileId)
      if (index >= 0)
        newProfiles.splice(index, 1)
      return {
        profiles: newProfiles,
        currentProfileId: undefined,
        currentTaskId: undefined,
      }
    })
  },

  filterProfileTasks: (by: string) => {
    const p = get().profiles.find(p => p.uid === by)
    if (p && p.tasks)
      return p.tasks
    return []
  },
  setCurrentTask: (id?: string) => {
    set({ currentTaskId: id })
  },
  getCurrentTask: () => {
    const p = get().profiles.find(p => p.uid === get().currentProfileId)
    if (p && p.tasks)
      return p.tasks.find(t => t.uid === get().currentTaskId)
    return undefined
  },
  appendProfileTask: () => {
    set((state) => {
      const newProfiles = state.profiles.slice()
      const p = newProfiles.find(p => p.uid === state.currentProfileId)
      if (p && p.tasks) {
        p.tasks.push({
          uid: uid('Task'),
          name: 'New Task',
          description: '',
          points: [],
        })
      }
      return { profiles: newProfiles }
    })
  },
  appendProfileTaskPoint: (point: NavPoint) => {
    set((state) => {
      const newProfiles = state.profiles.slice()
      const p = newProfiles.find(p => p.uid === state.currentProfileId)
      if (p && p.tasks) {
        const t = p.tasks.find(t => t.uid === state.currentTaskId)
        if (t) {
          if (!t.points)
            t.points = []
          t.points.push({
            uid: point.uid,
            type: 'auto',
            precise: false,
            reverse: false,
            actions: [],
          })
        }
      }
      return { profiles: newProfiles }
    })
  },
  updateProfileTaskPoint: (index: number, task: Partial<TaskPoint>) => {
    set((state) => {
      const newProfiles = state.profiles.slice()
      const p = newProfiles.find(p => p.uid === state.currentProfileId)
      if (p && p.tasks) {
        const t = p.tasks.find(t => t.uid === state.currentTaskId)
        if (t && t.points)
          Object.assign(t.points[index], task)
      }
      return { profiles: newProfiles }
    })
  },
  removeProfileTaskPoint: (index: number) => {
    set((state) => {
      const newProfiles = state.profiles.slice()
      const p = newProfiles.find(p => p.uid === state.currentProfileId)
      if (p && p.tasks) {
        const t = p.tasks.find(t => t.uid === state.currentTaskId)
        if (t && t.points)
          t.points.splice(index, 1)
      }
      return { profiles: newProfiles }
    })
  },
  swapProfileTaskPoints: (from: number, to: number) => {
    set((state) => {
      const newProfiles = state.profiles.slice()
      const p = newProfiles.find(p => p.uid === state.currentProfileId)
      if (p && p.tasks) {
        const t = p.tasks.find(t => t.uid === state.currentTaskId)
        if (t && t.points) {
          const tmp = t.points[from]
          t.points[from] = t.points[to]
          t.points[to] = tmp
        }
      }
      return { profiles: newProfiles }
    })
  },
  removeProfileTask: (id: string) => {
    set((state) => {
      const newProfiles = state.profiles.slice()
      const p = newProfiles.find(p => p.uid === state.currentProfileId)
      if (p && p.tasks) {
        const index = p.tasks.findIndex(t => t.uid === id)
        if (index >= 0)
          p.tasks.splice(index, 1)
      }
      return { profiles: newProfiles }
    })
  },
})
