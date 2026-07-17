import { useEffect, useState } from 'react'
import apiServer from '@/service/apiServer'
import { useParamsStore } from '@/store'
import type { FleetConfigNamespaceData } from '@/service/apiServer'

const fleetSiteNamespaceUpdatedEvent = 'zcbox:fleet-site-namespace-updated'

export interface FleetSiteNamespaceState {
  namespace: string
  status: string
  error: string | null
}

const initialState: FleetSiteNamespaceState = {
  namespace: '',
  status: 'idle',
  error: null,
}

export function normalizeFleetSiteNamespace(value: string) {
  return value.trim().replace(/^\/+/, '').replace(/\/+$/, '')
}

export function prefixFleetSiteTopic(namespace: string, topic: string) {
  const normalizedNamespace = normalizeFleetSiteNamespace(namespace)
  const normalizedTopic = topic.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  if (!normalizedTopic)
    return ''
  if (!normalizedNamespace || normalizedTopic.startsWith(`${normalizedNamespace}/`))
    return normalizedTopic

  return `${normalizedNamespace}/${normalizedTopic}`
}

function namespaceFromConfig(data: FleetConfigNamespaceData | null | undefined) {
  return normalizeFleetSiteNamespace(data?.namespace || data?.site_id || '')
}

function stateFromNamespace(namespace: string): FleetSiteNamespaceState {
  return {
    namespace,
    status: namespace ? 'loaded' : 'missing',
    error: namespace ? null : 'Fleet site name is not configured',
  }
}

export function notifyFleetSiteNamespaceUpdated(namespace: string) {
  if (typeof window === 'undefined')
    return

  window.dispatchEvent(new CustomEvent(fleetSiteNamespaceUpdatedEvent, {
    detail: { namespace: normalizeFleetSiteNamespace(namespace) },
  }))
}

export function useFleetSiteNamespace() {
  const nestControllerIp = useParamsStore(state => state.nestControllerIp)
  const [state, setState] = useState<FleetSiteNamespaceState>(initialState)

  useEffect(() => {
    if (!window.zcDesktop?.isDesktop || !nestControllerIp) {
      setState({
        ...initialState,
        status: window.zcDesktop?.isDesktop ? 'missing-controller' : 'desktop-only',
      })
      return
    }

    let disposed = false

    const handleNamespaceUpdated = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null
      const namespace = normalizeFleetSiteNamespace(typeof detail?.namespace === 'string' ? detail.namespace : '')
      if (!disposed)
        setState(stateFromNamespace(namespace))
    }

    const loadNamespace = async () => {
      setState(current => ({ ...current, status: 'loading', error: null }))
      try {
        const response = await apiServer.fetchFleetConfigNamespace()
        if (!disposed)
          setState(stateFromNamespace(namespaceFromConfig(response.data)))
      }
      catch (error) {
        if (!disposed) {
          setState({
            namespace: '',
            status: 'error',
            error: error instanceof Error ? error.message : `${error}`,
          })
        }
      }
    }

    window.addEventListener(fleetSiteNamespaceUpdatedEvent, handleNamespaceUpdated)
    void loadNamespace()

    return () => {
      disposed = true
      window.removeEventListener(fleetSiteNamespaceUpdatedEvent, handleNamespaceUpdated)
    }
  }, [nestControllerIp])

  return state
}
