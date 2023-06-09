import type { StateCreator } from 'zustand'
import type { NavigationSlice } from './navigation'
import type { NavTask, PointNavType } from '@/types'
import { uid } from '@/util'
import apiServer from '@/service/apiServer'

export interface TaskSlice {
  tasks: NavTask[]
  enabledTaskId: string | null
  executingTaskId: string | null

  // Action
  enableTask: (id: string | null) => void
  task: (by: string) => NavTask | undefined
  addTask: () => void
  appendTaskPoint: (point: string) => void
  removeTaskPoint: (id: string, index: number) => void
  swapTaskPoints: (id: string, from: number, to: number) => void
  updateTask: (id: string, index: number, type: PointNavType, precise: boolean, reverse: boolean, actions: {
    type: string
    args: any
  }[]) => void
  executeTask: (id: string) => Promise<void>
  stopTask: () => Promise<void>
  fetchTasks: () => Promise<void>
  submitTasks: () => Promise<void>
}

export const taskSlice: StateCreator<NavigationSlice & TaskSlice, [], [], TaskSlice> = (set, get) => ({
  tasks: [],
  enabledTaskId: null,
  executingTaskId: null,

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
  removeTaskPoint: (id: string, index: number) => {
    set((state) => {
      const newTasks = state.tasks.slice()
      const task = newTasks.find(t => t.id === id)
      if (!task)
        return { ...state }
      task.points.splice(index, 1)
      return { tasks: newTasks }
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
        const p = state.points.find(p => p.id === point)
        task.points.push({
          id: point,
          precise: false,
          reverse: false,
          type: 'auto',
          actions: [],
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
  updateTask: (id: string, index: number, type: PointNavType, precise: boolean, reverse: boolean, actions: {
    type: string
    args: any
  }[]) => {
    set((state) => {
      const newTasks = state.tasks.slice()
      const task = newTasks.find(t => t.id === id)!
      task.points[index].type = type
      task.points[index].precise = precise
      task.points[index].reverse = reverse
      task.points[index].actions = actions
      return { tasks: newTasks }
    })
  },
  executeTask: async (id: string) => {
    await apiServer.executeTask(id)
    set(() => {
      return { executingTaskId: id }
    })
  },
  stopTask: async () => {
    await apiServer.stopTask()
    set(() => {
      return { executingTaskId: null }
    })
  },
  fetchTasks: async () => {
    const tasks = await apiServer.fetchTasks()
    set(() => {
      return { tasks }
    })
  },
  submitTasks: async () => {
    const tasks = get().tasks
    if (tasks.length)
      await apiServer.submitTasks(tasks)
  },
})
