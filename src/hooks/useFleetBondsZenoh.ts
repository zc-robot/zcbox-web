import { useEffect, useMemo, useState } from 'react'
import { buildFleetBondTopics, upsertFleetBond } from './fleetBondModel'
import type { FleetBondValues } from './fleetBondModel'
import apiServer from '@/service/apiServer'
import { useParamsStore } from '@/store'
import type { FleetRobotDataMessage } from '@/types'

export interface FleetBondsZenohState {
  connected: boolean
  status: string
  keys: string[]
  fallbackNamespace: string
  updatedAt: number | null
  values: FleetBondValues
  error: string | null
}

const initialState: FleetBondsZenohState = {
  connected: false,
  status: 'idle',
  keys: [],
  fallbackNamespace: '',
  updatedAt: null,
  values: {},
  error: null,
}

function normalizeNamespace(value: string) {
  return value.trim().replace(/^\/+/, '').replace(/\/+$/, '')
}

export function useFleetBondsZenoh(robots: FleetRobotDataMessage[]) {
  const nestControllerIp = useParamsStore(state => state.nestControllerIp)
  const [fallbackNamespace, setFallbackNamespace] = useState('')
  const topicsKey = useMemo(
    () => buildFleetBondTopics(robots, fallbackNamespace).join('\n'),
    [robots, fallbackNamespace],
  )
  const topics = useMemo(() => topicsKey ? topicsKey.split('\n') : [], [topicsKey])
  const [state, setState] = useState<FleetBondsZenohState>(initialState)

  useEffect(() => {
    if (!window.zcDesktop?.isDesktop || !nestControllerIp) {
      setFallbackNamespace('')
      return
    }

    let disposed = false
    apiServer.fetchZenohNamespace().then((namespace) => {
      if (!disposed)
        setFallbackNamespace(normalizeNamespace(namespace))
    }).catch((error) => {
      if (!disposed) {
        setFallbackNamespace('')
        console.warn('Failed to fetch fallback namespace for node health', error)
      }
    })

    return () => {
      disposed = true
    }
  }, [nestControllerIp])

  useEffect(() => {
    if (!window.zcDesktop?.isDesktop || !nestControllerIp) {
      setState({
        ...initialState,
        status: window.zcDesktop?.isDesktop ? 'missing-controller' : 'desktop-only',
      })
      return
    }

    if (topics.length === 0) {
      setState({ ...initialState, status: 'waiting-robots', fallbackNamespace })
      window.zcDesktop.stopZenohBonds().catch(error => console.warn('Failed to stop bond bridge', error))
      return
    }

    let disposed = false
    const removeListener = window.zcDesktop.onZenohBonds((message) => {
      if (disposed)
        return

      if (message.type === 'status') {
        setState(current => ({
          ...current,
          connected: message.state === 'subscribed',
          status: message.state,
          keys: message.keys ?? current.keys,
          fallbackNamespace,
          error: null,
        }))
        return
      }

      if (message.type === 'bond') {
        const now = Date.now()
        const namespace = normalizeNamespace(message.namespace)
        setState(current => ({
          ...current,
          connected: true,
          status: 'subscribed',
          updatedAt: now,
          values: upsertFleetBond(current.values, namespace, message, now),
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
        console.warn('Bond bridge:', message)
      }
    })

    setState(current => ({
      ...current,
      status: 'starting',
      keys: topics,
      fallbackNamespace,
      error: null,
    }))
    window.zcDesktop.startZenohBonds({ host: nestControllerIp, topics }).catch((error) => {
      if (!disposed) {
        setState(current => ({
          ...current,
          connected: false,
          status: 'error',
          error: `${error}`,
        }))
      }
    })

    return () => {
      disposed = true
      removeListener()
      window.zcDesktop?.stopZenohBonds().catch(error => console.warn('Failed to stop bond bridge', error))
    }
  }, [fallbackNamespace, nestControllerIp, topics])

  return state
}
