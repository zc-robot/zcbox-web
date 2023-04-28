import type { StateCreator } from 'zustand'
import type { NavigationSlice } from './navigation'
import type { NavTask, PointNavType } from '@/types'
import { uid } from '@/util'

export interface TaskSlice {
  tasks: NavTask[]
  enabledTaskId: string | null

  // Action
  enableTask: (id: string | null) => void
  task: (by: string) => NavTask | undefined
  addTask: () => void
  appendTaskPoint: (point: string) => void
  swapTaskPoints: (id: string, from: number, to: number) => void
  updatePointNavType: (id: string, index: number, type: PointNavType) => void
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
      const enabledTaskId = get().enabledTaskId
      if (!enabledTaskId) {
        return { ...state }
      }
      else {
        const newTasks = state.tasks.slice()
        const task = newTasks.find(t => t.id === enabledTaskId)
        if (!task)
          return { ...state }
        task.points.push({
          id: point,
          type: 'auto',
          actions: [{}],
        })
        return { tasks: newTasks }
      }
    })
  },
  swapTaskPoints: (id: string, from: number, to: number) => {
    set((state) => {
      const newTasks = state.tasks.slice()
      const task = newTasks.find(t => t.id === id)!
      const point = task.points[from]
      task.points.splice(from, 1)
      task.points.splice(to, 0, point)
      return { tasks: newTasks }
    })
  },
  updatePointNavType: (id: string, index: number, type: PointNavType) => {
    set((state) => {
      const newTasks = state.tasks.slice()
      const task = newTasks.find(t => t.id === id)!
      task.points[index].type = type
      return { tasks: newTasks }
    })
  },
})
