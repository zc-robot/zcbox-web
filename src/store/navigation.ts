import type { StateCreator } from 'zustand'
import apiServer from '@/service/apiServer'
import type { NavPath, NavPoint } from '@/types'
import { uid } from '@/util'
import { dumpNavPoint } from '@/util/transform'

export interface NavigationSlice {
  points: NavPoint[]
  paths: NavPath[]

  // Actions
  point: (by: string) => NavPoint | undefined
  addPoint: (point: { x: number; y: number }) => string
  updatePoint: (id: string, point: Partial<NavPoint>) => void
  removePoint: (id: string) => void
  path: (by: string) => NavPath | undefined
  addPath: (start: string, end: string) => void
  updatePath: (id: string, controls: Partial<{ x: number; y: number }[]>) => void
  removePath: (id: string) => void
  submitNavInfo: () => Promise<void>
}

export const navigationSlice: StateCreator<NavigationSlice> = (set, get) => ({
  points: [],
  paths: [],

  point: (by: string) => {
    return get().points.find(p => p.id === by)
  },
  addPoint: (point: { x: number; y: number }) => {
    const id = uid('point')
    set((state) => {
      const newPoints = state.points.slice()
      const p = {
        id,
        x: point.x,
        y: point.y,
        rotation: 0,
      }
      newPoints.push(p)
      return { points: newPoints }
    })
    return id
  },
  updatePoint: (id: string, point: Partial<NavPoint>) => {
    set((state) => {
      const newPoints = state.points.slice()
      const p = newPoints.find(p => p.id === id)!
      Object.assign(p, point)
      return { points: newPoints }
    })
  },
  removePoint: (id: string) => {
    set((state) => {
      let newPoints = state.points.slice()
      newPoints = newPoints.filter(p => p.id !== id)

      const newPaths = state.paths.filter(p => p.start.id !== id && p.end.id !== id)
      return { points: newPoints, paths: newPaths }
    })
  },
  path: (by: string) => {
    return get().paths.find(p => p.id === by)!
  },
  addPath: (start: string, end: string) => {
    set((state) => {
      const id = uid('path')
      const newPaths = state.paths.slice()
      const startPoint = get().point(start)!
      const endPoint = get().point(end)!
      const ctrs = [
        {
          id: `${id}-ctrl1`,
          x: startPoint.x + (endPoint.x - startPoint.x) / 4,
          y: startPoint.y + (endPoint.y - startPoint.y) / 4,
          rotation: 0,
        },
        {
          id: `${id}-ctrl2`,
          x: startPoint.x + (endPoint.x - startPoint.x) * 3 / 4,
          y: startPoint.y + (endPoint.y - startPoint.y) * 3 / 4,
          rotation: 0,
        },
      ]
      const p = {
        id,
        start: startPoint,
        end: endPoint,
        controls: ctrs,
      }
      newPaths.push(p)
      return { paths: newPaths }
    })
  },
  updatePath: (id: string, controls: Partial<{ x: number; y: number }[]>) => {
    set((state) => {
      const newPaths = state.paths.slice()
      const p = newPaths.find(p => p.id === id)!
      Object.assign(p.controls, controls)
      return { paths: newPaths }
    })
  },
  removePath: (id: string) => {
    set((state) => {
      let newPaths = state.paths.slice()
      newPaths = newPaths.filter(p => p.id !== id)
      return { paths: newPaths }
    })
  },
  submitNavInfo: async () => {
    const points = get().points.map((p) => {
      return dumpNavPoint(p)
    })
    const paths = get().paths.map((p) => {
      const start = get().points.find(point => point.id === p.start.id)!
      const end = get().points.find(point => point.id === p.end.id)!
      return {
        id: p.id,
        start: p.start.id,
        end: p.end.id,
        points: [
          dumpNavPoint(start).position,
          dumpNavPoint(p.controls[0]).position,
          dumpNavPoint(p.controls[1]).position,
          dumpNavPoint(end).position,
        ],
      }
    })
    await apiServer.submitNavgationInfo({ points, paths })
  },
})