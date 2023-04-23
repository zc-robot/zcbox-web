import { create } from "zustand"
import { GridSlice, gridSlice } from "./grid"
import { NavigationSlice, navigationSlice } from "./navigation"
import { devtools } from "zustand/middleware"

const useBoundStore = create<GridSlice & NavigationSlice>()(devtools(
  (...a) => ({
    ...gridSlice(...a),
    ...navigationSlice(...a),
  })
))

export const useNavigationStore = <T>(
  selector?: (state: NavigationSlice) => T,
  equals?: (a: T, b: T) => boolean
) => {
  return useBoundStore(selector!, equals)
}

export const useGridStore = <T>(
  selector?: (state: GridSlice) => T,
  equals?: (a: T, b: T) => boolean
) => {
  return useBoundStore(selector!, equals)
}
