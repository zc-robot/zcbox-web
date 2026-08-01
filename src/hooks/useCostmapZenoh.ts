import { useEffect, useRef } from 'react'
import apiServer from '@/service/apiServer'
import { useBoundStore, useGridStore, useParamsStore } from '@/store'
import { applyCostmapMessage } from '@/util/costmapModel'
import type { CostmapLayer } from '@/util/costmapModel'

const INITIAL_DATA_TIMEOUT_MS = 3_000
const STALE_TIMEOUT_MS = 5_000

function layerLabel(layer: CostmapLayer) {
  return layer === 'global' ? 'Global Costmap' : 'Local Costmap'
}

function useCostmapLayerZenoh(layer: CostmapLayer, routeKey: string | null) {
  const nestControllerIp = useParamsStore(state => state.nestControllerIp)
  const visible = useGridStore(state => state.costmaps[layer].visible)
  const setCostmapStatus = useGridStore(state => state.setCostmapStatus)
  const setCostmapGrid = useGridStore(state => state.setCostmapGrid)
  const clearCostmap = useGridStore(state => state.clearCostmap)

  useEffect(() => {
    if (!routeKey || !visible || !window.zcDesktop?.isDesktop || !nestControllerIp)
      return

    let disposed = false
    let noDataTimer: number | null = null

    const clearNoDataTimer = () => {
      if (noDataTimer != null) {
        window.clearTimeout(noDataTimer)
        noDataTimer = null
      }
    }

    setCostmapStatus(layer, 'waiting')
    noDataTimer = window.setTimeout(() => {
      const current = useBoundStore.getState().costmaps[layer]
      if (!disposed && current.visible && !current.grid)
        setCostmapStatus(layer, 'no-data', 'No costmap data')
    }, INITIAL_DATA_TIMEOUT_MS)

    const staleTimer = window.setInterval(() => {
      const current = useBoundStore.getState().costmaps[layer]
      if (!disposed && current.grid && current.lastUpdateAt != null
        && Date.now() - current.lastUpdateAt >= STALE_TIMEOUT_MS
        && current.status !== 'stale')
        setCostmapStatus(layer, 'stale', 'Costmap data is stale')
    }, 1_000)

    const removeListener = window.zcDesktop.onZenohCostmap((message) => {
      if (disposed || message.layer !== layer)
        return

      if (message.type === 'costmap') {
        try {
          const current = useBoundStore.getState().costmaps[layer].grid
          const result = applyCostmapMessage(current, message)
          if (result.kind === 'applied') {
            clearNoDataTimer()
            setCostmapGrid(layer, result.grid)
          }
        }
        catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          clearNoDataTimer()
          clearCostmap(layer, 'error', `${layerLabel(layer)}: ${detail}`)
        }
        return
      }

      if (message.type === 'error' || message.type === 'decode-error') {
        clearNoDataTimer()
        const detail = message.message?.trim()
        clearCostmap(layer, 'error', detail
          ? `${layerLabel(layer)}: ${detail}`
          : `${layerLabel(layer)} data is invalid`)
        return
      }

      if (message.type === 'status' && message.state === 'stopped') {
        clearNoDataTimer()
        clearCostmap(layer, 'error', `${layerLabel(layer)} subscription stopped`)
      }
    })

    const start = async () => {
      try {
        const namespace = await apiServer.fetchZenohNamespace()
        if (disposed)
          return

        await window.zcDesktop?.startZenohCostmap({
          host: nestControllerIp,
          namespace,
          layer,
        })
      }
      catch (error) {
        if (disposed)
          return
        const detail = error instanceof Error ? error.message : String(error)
        clearNoDataTimer()
        clearCostmap(layer, 'error', `${layerLabel(layer)} could not start: ${detail}`)
      }
    }

    void start()

    return () => {
      disposed = true
      clearNoDataTimer()
      window.clearInterval(staleTimer)
      removeListener()
      window.zcDesktop?.stopZenohCostmap(layer).catch((error) => {
        console.warn(`Failed to stop ${layerLabel(layer)}`, error)
      })
    }
  }, [clearCostmap, layer, nestControllerIp, routeKey, setCostmapGrid, setCostmapStatus, visible])
}

export function useCostmapZenoh(routeKey: string | null) {
  const nestControllerIp = useParamsStore(state => state.nestControllerIp)
  const resetCostmaps = useGridStore(state => state.resetCostmaps)
  const previousControllerRef = useRef(nestControllerIp)
  const previousRouteRef = useRef(routeKey)

  useEffect(() => {
    if (previousRouteRef.current !== routeKey) {
      previousRouteRef.current = routeKey
      resetCostmaps()
    }
  }, [resetCostmaps, routeKey])

  useEffect(() => {
    if (previousControllerRef.current !== nestControllerIp) {
      previousControllerRef.current = nestControllerIp
      resetCostmaps()
    }
  }, [nestControllerIp, resetCostmaps])

  useEffect(() => () => resetCostmaps(), [resetCostmaps])

  useCostmapLayerZenoh('global', routeKey)
  useCostmapLayerZenoh('local', routeKey)
}
