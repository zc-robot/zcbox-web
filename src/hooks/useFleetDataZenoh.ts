import { useEffect, useState } from 'react'
import { useParamsStore } from '@/store'
import { useFleetSiteNamespace } from './useFleetSiteNamespace'
import type { FleetDataMessage } from '@/types'

const FLEET_DATA_TOPIC = 'fleet_data'

interface FleetDataZenohState {
  connected: boolean
  status: string
  key: string
  updatedAt: number | null
  data: FleetDataMessage | null
  error: string | null
}

const initialState: FleetDataZenohState = {
  connected: false,
  status: 'idle',
  key: '',
  updatedAt: null,
  data: null,
  error: null,
}

export function useFleetDataZenoh() {
  const nestControllerIp = useParamsStore(state => state.nestControllerIp)
  const fleetSiteNamespace = useFleetSiteNamespace()
  const [state, setState] = useState<FleetDataZenohState>(initialState)

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
      window.zcDesktop.stopZenohFleetData().catch((error) => {
        console.warn('Failed to stop Zenoh fleet data bridge', error)
      })
      return
    }

    let disposed = false

    const removeListener = window.zcDesktop.onZenohFleetData((message) => {
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

      if (message.type === 'fleet-data') {
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
        console.warn('Zenoh fleet data bridge:', message)
      }
    })

    const start = async () => {
      try {
        setState(current => ({ ...current, status: 'starting', error: null }))
        await window.zcDesktop?.startZenohFleetData({
          host: nestControllerIp,
          namespace: fleetSiteNamespace.namespace,
          topics: [FLEET_DATA_TOPIC],
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
        console.warn('Failed to start Zenoh fleet data bridge', error)
      }
    }

    start()

    return () => {
      disposed = true
      removeListener()
      window.zcDesktop?.stopZenohFleetData().catch((error) => {
        console.warn('Failed to stop Zenoh fleet data bridge', error)
      })
    }
  }, [fleetSiteNamespace.error, fleetSiteNamespace.namespace, fleetSiteNamespace.status, nestControllerIp])

  return state
}
