import { useEffect, useState } from 'react'
import { useParamsStore } from '@/store'
import { useFleetSiteNamespace } from './useFleetSiteNamespace'
import type { BuildingMapMessage } from '@/types'

const BUILDING_MAP_TOPIC = 'map'

interface BuildingMapZenohState {
  connected: boolean
  status: string
  key: string
  updatedAt: number | null
  data: BuildingMapMessage | null
  error: string | null
}

const initialState: BuildingMapZenohState = {
  connected: false,
  status: 'idle',
  key: '',
  updatedAt: null,
  data: null,
  error: null,
}

export function useBuildingMapZenoh() {
  const nestControllerIp = useParamsStore(state => state.nestControllerIp)
  const fleetSiteNamespace = useFleetSiteNamespace()
  const [state, setState] = useState<BuildingMapZenohState>(initialState)

  useEffect(() => {
    if (!window.zcDesktop?.isDesktop || !nestControllerIp) {
      setState({
        ...initialState,
        status: window.zcDesktop?.isDesktop ? 'missing-controller' : 'desktop-only',
      })
      return
    }

    if (fleetSiteNamespace.status === 'idle' || fleetSiteNamespace.status === 'loading') {
      setState({
        ...initialState,
        status: 'loading-site-namespace',
      })
      return
    }

    if (!fleetSiteNamespace.namespace) {
      setState({
        ...initialState,
        status: 'missing-site-namespace',
        error: fleetSiteNamespace.error || 'Fleet site name is not configured',
      })
      window.zcDesktop.stopZenohBuildingMap().catch((error) => {
        console.warn('Failed to stop Zenoh building map bridge', error)
      })
      return
    }

    let disposed = false

    const removeListener = window.zcDesktop.onZenohBuildingMap((message) => {
      if (disposed)
        return

      if (message.type === 'status') {
        setState(current => ({
          ...current,
          connected: message.state === 'subscribed',
          status: message.state,
          error: null,
        }))
        return
      }

      if (message.type === 'building-map') {
        setState(current => ({
          ...current,
          connected: true,
          status: 'subscribed',
          key: message.key,
          updatedAt: Date.now(),
          data: message,
          error: null,
        }))
        return
      }

      if (message.type === 'error' || message.type === 'decode-error') {
        setState(current => ({
          ...current,
          connected: false,
          status: message.type,
          error: message.message || `${message.type}${message.key ? `: ${message.key}` : ''}`,
        }))
        console.warn('Zenoh building map bridge:', message)
      }
    })

    const start = async () => {
      try {
        setState(current => ({ ...current, status: 'starting', error: null }))
        await window.zcDesktop?.startZenohBuildingMap({
          host: nestControllerIp,
          namespace: fleetSiteNamespace.namespace,
          topics: [BUILDING_MAP_TOPIC],
        })
      }
      catch (error) {
        if (disposed)
          return

        setState(current => ({
          ...current,
          connected: false,
          status: 'error',
          error: `${error}`,
        }))
        console.warn('Failed to start Zenoh building map bridge', error)
      }
    }

    start()

    return () => {
      disposed = true
      removeListener()
      window.zcDesktop?.stopZenohBuildingMap().catch((error) => {
        console.warn('Failed to stop Zenoh building map bridge', error)
      })
    }
  }, [fleetSiteNamespace.error, fleetSiteNamespace.namespace, fleetSiteNamespace.status, nestControllerIp])

  return state
}
