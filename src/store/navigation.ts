import { NavPoint } from "@/types"
import { uid } from "@/util"
import { StateCreator, create, useStore } from "zustand"
import { devtools } from "zustand/middleware"

export interface NavigationSlice {
  wayPoints: NavPoint[]

  // Actions
  point: (by: string) => NavPoint
  addPoint: (point: { x: number, y: number }) => void
  updatePoint: (id: string, point: Partial<NavPoint>) => void
}


export const navigationSlice: StateCreator<NavigationSlice> = (set, get) => ({
  wayPoints: [],

  point: (by: string) => {
    return get().wayPoints.find((p) => p.id === by)!
  },
  addPoint: (point: { x: number, y: number }) => {
    set((state) => {
      let newPoints = state.wayPoints.slice()
      const p = {
        id: uid("waypoint"),
        x: point.x,
        y: point.y,
        rotation: 0,
      }
      newPoints.push(p)
      return { wayPoints: newPoints }
    })
  },
  updatePoint: (id: string, point: Partial<NavPoint>) => {
    set((state) => {
      let newPoints = state.wayPoints.slice()
      const p = newPoints.find((p) => p.id === id)!
      Object.assign(p, point)
      return { wayPoints: newPoints }
    })
  }
})
