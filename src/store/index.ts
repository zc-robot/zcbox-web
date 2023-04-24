import { create } from "zustand"
import { GridSlice, gridSlice } from "./grid"
import { NavigationSlice, navigationSlice } from "./navigation"
import { devtools } from "zustand/middleware"
import { OperationSlice, operationSlice } from "./operation"

const useBoundStore = create<GridSlice & NavigationSlice & OperationSlice>()(devtools(
  (...a) => ({
    ...gridSlice(...a),
    ...navigationSlice(...a),
    ...operationSlice(...a),
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

export const useOperationStore = <T>(
  selector?: (state: OperationSlice) => T,
  equals?: (a: T, b: T) => boolean
) => {
  return useBoundStore(selector!, equals)
}
