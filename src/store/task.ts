import type { StateCreator } from 'zustand'
import type { NavigationSlice } from './navigation'
import type { NavTask } from '@/types'
import { uid } from '@/util'

export interface TaskSlice {
  tasks: NavTask[]
  enabledTaskId: string | null

  // Action
  enableTask: (id: string | null) => void
  task: (by: string) => NavTask | undefined
  addTask: () => void
  appendTaskPoint: (point: string) => void
  swipTaskPoints: (id: string, from: number, to: number) => void
}

export const taskSlice: StateCreator<NavigationSlice & TaskSlice, [], [], TaskSlice> = (set, get) => ({
  tasks: [],
  enabledTaskId: null,

  enableTask: (id: string | null) => {
    set(() => {
      return { enabledTaskId: id }
    })
  },
  task: (by: string) => {
    return get().tasks.find(p => p.id === by)
  },
  addTask: () => {
    set((state) => {
      const id = uid('Task')
      const newTasks = state.tasks.slice()
      const newTask = {
        id,
        points: [],
      }
      newTasks.push(newTask)
      return { tasks: newTasks, currentTaskId: id }
    })
  },
  appendTaskPoint: (point: string) => {
    set((state) => {
      const newTasks = state.tasks.slice()
      const task = newTasks.find(t => t.id === get().enabledTaskId)
      if (!task)
        return { ...state }
      task.points.push({
        id: point,
        payload: {},
      })
      return { tasks: newTasks }
    })
  },
  swipTaskPoints: (id: string, from: number, to: number) => {
    set((state) => {
      const newTasks = state.tasks.slice()
      const task = newTasks.find(t => t.id === id)!
      const point = task.points[from]
      task.points.splice(from, 1)
      task.points.splice(to, 0, point)
      return { tasks: newTasks }
    })
  },
})
