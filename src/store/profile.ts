import type { StateCreator } from 'zustand'
import type { NavDoor, NavLift, NavPath, NavPoint, NavProfile, NavTask, PoseMessage, TaskPoint } from '@/types'
import { uid } from '@/util'
import { quaternionToCanvasAngle } from '@/util/transform'

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
  currentProfileDoors: () => NavDoor[]
  currentProfileLifts: () => NavLift[]
  currentProfileTasks: () => NavTask[]
  removeProfile: (id: string) => void

  // Modify current profile's fields
  updateCurrentProfile: (profile: Partial<NavProfile>) => void
  appendCurrentProfilePoint: (point: NavPoint) => void
  appendCurrentProfilePointFromPose: (pose: PoseMessage) => string | null
  updateCurrentProfilePoint: (pid: string, point: Partial<NavPoint>) => void
  updateCurrentProfilePoints: (points: { uid: string; point: Partial<NavPoint> }[]) => void
  removeCurrentProfilePoint: (pid: string) => void
  appendCurrentProfilePath: (path: NavPath) => void
  updateCurrentProfilePath: (pid: string, path: Partial<NavPath>) => void
  removeCurrentProfilePath: (pid: string) => void
  appendCurrentProfileDoor: (door: NavDoor) => void
  updateCurrentProfileDoor: (id: string, door: Partial<NavDoor>) => void
  removeCurrentProfileDoor: (id: string) => void
  appendCurrentProfileLift: (lift: NavLift) => void
  updateCurrentProfileLift: (id: string, lift: Partial<NavLift>) => void
  removeCurrentProfileLift: (id: string) => void

  setCurrentTask: (id?: string) => void
  getCurrentTask: () => NavTask | undefined
  // Modify current profile's tasks
  updateCurrentTask: (task: Partial<NavTask>) => void
  appendProfileTask: () => void
  appendProfileTaskPoint: (point: NavPoint) => void
  updateProfileTaskPoint: (index: number, task: Partial<TaskPoint>) => void
  removeProfileTaskPoint: (index: number) => void
  swapProfileTaskPoints: (from: number, to: number) => void
  removeProfileTask: (id: string) => void
}

function syncPathEndpoints(paths: NavPath[], updates: Map<string, Partial<NavPoint>>) {
  paths.forEach((path) => {
    const startUpdate = updates.get(path.start.uid)
    if (startUpdate) {
      if (startUpdate.x !== undefined)
        path.start.x = startUpdate.x
      if (startUpdate.y !== undefined)
        path.start.y = startUpdate.y
    }

    const endUpdate = updates.get(path.end.uid)
    if (endUpdate) {
      if (endUpdate.x !== undefined)
        path.end.x = endUpdate.x
      if (endUpdate.y !== undefined)
        path.end.y = endUpdate.y
    }
  })
}

function ensureProfileData(profile: NavProfile) {
  if (!profile.data) {
    profile.data = {
      waypoints: [],
      paths: [],
      doors: [],
      lifts: [],
    }
    return
  }

  profile.data.waypoints ??= []
  profile.data.paths ??= []
  profile.data.doors ??= []
  profile.data.lifts ??= []
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
        name: `配置 ${id.slice(-3)}`,
        description: '',
        data: {
          waypoints: [],
          paths: [],
          doors: [],
          lifts: [],
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
        ensureProfileData(p)
        const old = newProfiles.find(op => op.uid === p.uid)
        if (old)
          Object.assign(old, p)
        else
          newProfiles.push(p)
      })
      return {
        profiles: newProfiles,
        currentProfileId: profiles[0].uid,
        currentTaskId: profiles[0].tasks[0]?.uid,
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
    return p ? (p.data.paths ?? []) : []
  },
  currentProfileDoors: () => {
    const p = get().profiles.find(p => p.uid === get().currentProfileId)
    return p ? (p.data.doors ?? []) : []
  },
  currentProfileLifts: () => {
    const p = get().profiles.find(p => p.uid === get().currentProfileId)
    return p ? (p.data.lifts ?? []) : []
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
      if (p) {
        ensureProfileData(p)
        p.data.waypoints.push(point)
      }
      return { profiles: newProfiles }
    })
  },
  appendCurrentProfilePointFromPose: (pose) => {
    if (!get().currentProfileId)
      return null

    const id = uid('Point')
    get().appendCurrentProfilePoint({
      uid: id,
      name: `路径点 ${id.slice(-3)}`,
      x: pose.position.x,
      y: -pose.position.y,
      rotation: quaternionToCanvasAngle(pose.orientation),
      is_charger: false,
      is_parking_spot: false,
    })
    return id
  },
  updateCurrentProfilePoint: (pid: string, point: Partial<NavPoint>) => {
    get().updateCurrentProfilePoints([{ uid: pid, point }])
  },
  updateCurrentProfilePoints: (points) => {
    set((state) => {
      const newProfiles = state.profiles.slice()
      const p = newProfiles.find(p => p.uid === state.currentProfileId)
      if (p) {
        ensureProfileData(p)
        const updates = new Map(points.map(item => [item.uid, item.point]))

        p.data.waypoints = p.data.waypoints.map((waypoint) => {
          const update = updates.get(waypoint.uid)
          if (!update)
            return waypoint

          return Object.assign({}, waypoint, update)
        })

        if (p.data.paths)
          syncPathEndpoints(p.data.paths, updates)
      }
      return { profiles: newProfiles }
    })
  },
  removeCurrentProfilePoint: (pid: string) => {
    set((state) => {
      const newProfiles = state.profiles.slice()
      const p = newProfiles.find(p => p.uid === state.currentProfileId)
      if (p) {
        ensureProfileData(p)
        const index = p.data.waypoints.findIndex(p => p.uid === pid)
        if (index >= 0)
          p.data.waypoints.splice(index, 1)
      }
      // Remove relative path
      if (p)
        p.data.paths = p.data.paths.filter(path => path.start.uid !== pid && path.end.uid !== pid)
      // Remove point in task
      if (p && p.tasks) {
        p.tasks.forEach((t) => {
          if (t.points) {
            const index = t.points.findIndex(p => p.uid === pid)
            if (index >= 0)
              t.points.splice(index, 1)
          }
        })
      }
      return { profiles: newProfiles }
    })
  },
  appendCurrentProfilePath: (path: NavPath) => {
    set((state) => {
      const newProfiles = state.profiles.slice()
      const p = newProfiles.find(p => p.uid === state.currentProfileId)
      if (p) {
        ensureProfileData(p)
        p.data.paths.push(path)
      }
      return { profiles: newProfiles }
    })
  },
  updateCurrentProfilePath: (pid: string, path: Partial<NavPath>) => {
    set((state) => {
      const newProfiles = state.profiles.slice()
      const p = newProfiles.find(p => p.uid === state.currentProfileId)
      if (p) {
        ensureProfileData(p)
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
      if (p) {
        ensureProfileData(p)
        const index = p.data.paths.findIndex(p => p.uid === pid)
        if (index >= 0)
          p.data.paths.splice(index, 1)
      }
      return { profiles: newProfiles }
    })
  },
  appendCurrentProfileDoor: (door) => {
    set((state) => {
      const newProfiles = state.profiles.slice()
      const p = newProfiles.find(p => p.uid === state.currentProfileId)
      if (p) {
        ensureProfileData(p)
        p.data.doors.push(door)
      }
      return { profiles: newProfiles }
    })
  },
  updateCurrentProfileDoor: (id, door) => {
    set((state) => {
      const newProfiles = state.profiles.slice()
      const p = newProfiles.find(p => p.uid === state.currentProfileId)
      if (p) {
        ensureProfileData(p)
        const index = p.data.doors.findIndex(item => item.uid === id)
        if (index >= 0)
          Object.assign(p.data.doors[index], door)
      }
      return { profiles: newProfiles }
    })
  },
  removeCurrentProfileDoor: (id) => {
    set((state) => {
      const newProfiles = state.profiles.slice()
      const p = newProfiles.find(p => p.uid === state.currentProfileId)
      if (p) {
        ensureProfileData(p)
        p.data.doors = p.data.doors.filter(door => door.uid !== id)
      }
      return { profiles: newProfiles }
    })
  },
  appendCurrentProfileLift: (lift) => {
    set((state) => {
      const newProfiles = state.profiles.slice()
      const p = newProfiles.find(p => p.uid === state.currentProfileId)
      if (p) {
        ensureProfileData(p)
        p.data.lifts.push(lift)
      }
      return { profiles: newProfiles }
    })
  },
  updateCurrentProfileLift: (id, lift) => {
    set((state) => {
      const newProfiles = state.profiles.slice()
      const p = newProfiles.find(p => p.uid === state.currentProfileId)
      if (p) {
        ensureProfileData(p)
        const index = p.data.lifts.findIndex(item => item.uid === id)
        if (index >= 0)
          Object.assign(p.data.lifts[index], lift)
      }
      return { profiles: newProfiles }
    })
  },
  removeCurrentProfileLift: (id) => {
    set((state) => {
      const newProfiles = state.profiles.slice()
      const p = newProfiles.find(p => p.uid === state.currentProfileId)
      if (p) {
        ensureProfileData(p)
        p.data.lifts = p.data.lifts.filter(lift => lift.uid !== id)
      }
      return { profiles: newProfiles }
    })
  },
  removeProfile: (pid: string) => {
    set((state) => {
      const newProfiles = state.profiles.slice()
      const index = newProfiles.findIndex(p => p.uid === pid)
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
  updateCurrentTask: (task: Partial<NavTask>) => {
    set((state) => {
      const newProfiles = state.profiles.slice()
      const p = newProfiles.find(p => p.uid === state.currentProfileId)
      const t = p?.tasks.find(t => t.uid === state.currentTaskId)
      if (t)
        Object.assign(t, task)
      return { profiles: newProfiles }
    })
  },
  appendProfileTask: () => {
    const id = uid('Task')
    set((state) => {
      const newProfiles = state.profiles.slice()
      const p = newProfiles.find(p => p.uid === state.currentProfileId)
      if (p && p.tasks) {
        p.tasks.push({
          uid: id,
          name: `任务 ${id.slice(-3)}`,
          description: '',
          points: [],
        })
      }
      return {
        profiles: newProfiles,
        currentTaskId: id,
      }
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
            dest: false,
            precise_rad: 6.28,
            precise_xy: 0.3,
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
