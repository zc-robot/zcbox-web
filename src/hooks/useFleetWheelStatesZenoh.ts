import { useEffect, useMemo, useState } from 'react'
import apiServer from '@/service/apiServer'
import { useParamsStore } from '@/store'
import type { FleetRobotDataMessage, MotorStatesMessage } from '@/types'

export interface WheelStateValue extends MotorStatesMessage {
  key: string
  namespace: string
  updatedAt: number
}

export interface FleetWheelStatesZenohState {
  connected: boolean
  status: string
  keys: string[]
  fallbackNamespace: string
  updatedAt: number | null
  values: Record<string, WheelStateValue>
  error: string | null
}

const initialState: FleetWheelStatesZenohState = {
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

function getRobotNamespace(robot: FleetRobotDataMessage) {
  return normalizeNamespace(robot.zenohNamespace || '')
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function buildWheelStateTopics(robots: FleetRobotDataMessage[], fallbackNamespace: string) {
  const robotNamespaces = robots.map(getRobotNamespace).filter(Boolean)
  const hasMissingNamespace = robots.some(robot => !getRobotNamespace(robot))
  const namespaces = uniqueStrings([
    ...robotNamespaces,
    hasMissingNamespace ? normalizeNamespace(fallbackNamespace) : '',
  ]).sort()
  const topics = namespaces.map(namespace => `${namespace}/wheel/state`)

  if (robots.length > 0 && hasMissingNamespace)
    topics.push('**/wheel/state')

  return uniqueStrings(topics)
}

function parseWheelNamespace(key: string) {
  const normalized = key.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  const suffix = '/wheel/state'
  return normalized.endsWith(suffix) ? normalized.slice(0, -suffix.length) : ''
}

export function useFleetWheelStatesZenoh(robots: FleetRobotDataMessage[]) {
  const nestControllerIp = useParamsStore(state => state.nestControllerIp)
  const [fallbackNamespace, setFallbackNamespace] = useState('')
  const topicsKey = useMemo(
    () => buildWheelStateTopics(robots, fallbackNamespace).join('\n'),
    [robots, fallbackNamespace],
  )
  const topics = useMemo(() => topicsKey ? topicsKey.split('\n') : [], [topicsKey])
  const [state, setState] = useState<FleetWheelStatesZenohState>(initialState)

  useEffect(() => {
    if (!window.zcDesktop?.isDesktop || !nestControllerIp) {
      setFallbackNamespace('')
      return
    }

    let disposed = false

    const loadNamespace = async () => {
      try {
        const namespace = normalizeNamespace(await apiServer.fetchZenohNamespace())
        if (!disposed)
          setFallbackNamespace(namespace)
      }
      catch (error) {
        if (!disposed) {
          setFallbackNamespace('')
          console.warn('Failed to fetch fallback namespace for wheel state', error)
        }
      }
    }

    loadNamespace()

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
      setState({
        ...initialState,
        status: 'waiting-robots',
        fallbackNamespace,
      })
      window.zcDesktop.stopZenohWheelStates().catch((error) => {
        console.warn('Failed to stop wheel state bridge', error)
      })
      return
    }

    let disposed = false

    const removeListener = window.zcDesktop.onZenohWheelStates((message) => {
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

      if (message.type === 'motor-states') {
        const now = Date.now()
        const namespace = normalizeNamespace(message.namespace || parseWheelNamespace(message.key))
        setState(current => ({
          ...current,
          connected: true,
          status: 'subscribed',
          updatedAt: now,
          values: {
            ...current.values,
            [namespace]: {
              ...message,
              namespace,
              updatedAt: now,
            },
          },
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
        console.warn('Wheel state bridge:', message)
      }
    })

    const start = async () => {
      try {
        setState(current => ({
          ...current,
          status: 'starting',
          keys: topics,
          fallbackNamespace,
          error: null,
        }))
        await window.zcDesktop?.startZenohWheelStates({
          host: nestControllerIp,
          topics,
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
        console.warn('Failed to start wheel state bridge', error)
      }
    }

    start()

    return () => {
      disposed = true
      removeListener()
      window.zcDesktop?.stopZenohWheelStates().catch((error) => {
        console.warn('Failed to stop wheel state bridge', error)
      })
    }
  }, [fallbackNamespace, nestControllerIp, topics])

  return state
}
