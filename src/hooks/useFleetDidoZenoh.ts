import { useEffect, useMemo, useState } from 'react'
import apiServer from '@/service/apiServer'
import { useParamsStore } from '@/store'
import type { FleetRobotDataMessage, UInt8MultiArrayMessage } from '@/types'

export interface DidoValue extends UInt8MultiArrayMessage {
  key: string
  namespace: string
  channel: 'di' | 'do' | 'unknown'
  updatedAt: number
}

export interface RobotDidoValues {
  di?: DidoValue
  do?: DidoValue
}

export interface FleetDidoZenohState {
  connected: boolean
  status: string
  keys: string[]
  fallbackNamespace: string
  updatedAt: number | null
  values: Record<string, RobotDidoValues>
  error: string | null
}

const initialState: FleetDidoZenohState = {
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

function buildDidoTopics(robots: FleetRobotDataMessage[], fallbackNamespace: string) {
  const robotNamespaces = robots.map(getRobotNamespace).filter(Boolean)
  const hasMissingNamespace = robots.some(robot => !getRobotNamespace(robot))
  const namespaces = uniqueStrings([
    ...robotNamespaces,
    hasMissingNamespace ? normalizeNamespace(fallbackNamespace) : '',
  ]).sort()
  const topics = namespaces.flatMap(namespace => [
    `${namespace}/dido/di`,
    `${namespace}/dido/do`,
  ])

  if (robots.length > 0 && hasMissingNamespace)
    topics.push('**/dido/di', '**/dido/do')

  return uniqueStrings(topics)
}

export function useFleetDidoZenoh(robots: FleetRobotDataMessage[]) {
  const nestControllerIp = useParamsStore(state => state.nestControllerIp)
  const [fallbackNamespace, setFallbackNamespace] = useState('')
  const topicsKey = useMemo(() => buildDidoTopics(robots, fallbackNamespace).join('\n'), [robots, fallbackNamespace])
  const topics = useMemo(() => topicsKey ? topicsKey.split('\n') : [], [topicsKey])
  const [state, setState] = useState<FleetDidoZenohState>(initialState)

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
          console.warn('Failed to fetch fallback Zenoh namespace for DIDO', error)
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
      window.zcDesktop.stopZenohDido().catch((error) => {
        console.warn('Failed to stop Zenoh DIDO bridge', error)
      })
      return
    }

    let disposed = false

    const removeListener = window.zcDesktop.onZenohDido((message) => {
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

      if (message.type === 'dido') {
        const now = Date.now()
        setState(current => ({
          ...current,
          connected: true,
          status: 'subscribed',
          updatedAt: now,
          values: {
            ...current.values,
            [message.namespace]: {
              ...current.values[message.namespace],
              [message.channel]: {
                ...message,
                updatedAt: now,
              },
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
        console.warn('Zenoh DIDO bridge:', message)
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
        await window.zcDesktop?.startZenohDido({
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
        console.warn('Failed to start Zenoh DIDO bridge', error)
      }
    }

    start()

    return () => {
      disposed = true
      removeListener()
      window.zcDesktop?.stopZenohDido().catch((error) => {
        console.warn('Failed to stop Zenoh DIDO bridge', error)
      })
    }
  }, [fallbackNamespace, nestControllerIp, topics])

  return state
}
