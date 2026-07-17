import React, { useEffect, useMemo, useRef, useState } from 'react'
import apiServer from '@/service/apiServer'

export const NAVIGATION_TRANSITION_EVENT_TOPICS = [
  'amcl/transition_event',
  'behavior_server/transition_event',
  'bluesea_node/transition_event',
  'bt_navigator/transition_event',
  'collision_monitor/transition_event',
  'controller_server/transition_event',
  'filter_mask_server/transition_event',
  'global_costmap/global_costmap/transition_event',
  'local_costmap/local_costmap/transition_event',
  'map_server/transition_event',
  'planner_server/transition_event',
  'smoother_server/transition_event',
  'velocity_smoother/transition_event',
  'waypoint_follower/transition_event',
] as const

type RestartState = 'restarting' | 'succeeded' | 'failed'

interface NavigationTransitionEventsModalProps {
  host: string
  restartState: RestartState
  onReady: () => void
  onClose: () => void
}

interface TopicEventState {
  event: ZenohLifecycleTransitionPayloadMessage
  updatedAt: number
}

function getTopicFromKey(key: string) {
  return NAVIGATION_TRANSITION_EVENT_TOPICS.find(topic => key === topic || key.endsWith(`/${topic}`))
}

function normalizeRobotNamespace(namespace: string) {
  return namespace.trim().replace(/^\/+/, '').replace(/\/+$/, '')
}

function formatNamespacedTopic(namespace: string, topic: string) {
  return `/${namespace ? `${namespace}/` : ''}${topic}`
}

function formatState(state: LifecycleTransitionState) {
  return state.label || `State ${state.id}`
}

function formatRestartState(state: RestartState) {
  if (state === 'succeeded')
    return { label: '导航程序已重启', className: 'bg-emerald-50 text-emerald-700' }
  if (state === 'failed')
    return { label: '导航程序重启失败', className: 'bg-red-50 text-red-700' }
  return { label: '正在重启导航程序', className: 'bg-amber-50 text-amber-700' }
}

const NavigationTransitionEventsModal: React.FC<NavigationTransitionEventsModalProps> = ({ host, restartState, onReady, onClose }) => {
  const [connectionState, setConnectionState] = useState('starting')
  const [robotNamespace, setRobotNamespace] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<Partial<Record<typeof NAVIGATION_TRANSITION_EVENT_TOPICS[number], TopicEventState[]>>>({})
  const readyNotified = useRef(false)

  useEffect(() => {
    if (!window.zcDesktop?.isDesktop || !host) {
      setConnectionState('unavailable')
      setError(!window.zcDesktop?.isDesktop ? '生命周期事件仅在桌面版中可用' : '未配置机器人连接地址')
      return
    }

    let disposed = false
    const removeListener = window.zcDesktop.onZenohLifecycleTransition((message) => {
      if (disposed)
        return

      if (message.type === 'status') {
        setConnectionState(message.state)
        if (message.state === 'subscribed' && !readyNotified.current) {
          readyNotified.current = true
          onReady()
        }
        return
      }

      if (message.type === 'transition-event') {
        const topic = getTopicFromKey(message.key)
        if (!topic)
          return
        setEvents(current => ({
          ...current,
          [topic]: [...(current[topic] ?? []), { event: message, updatedAt: Date.now() }].slice(-10),
        }))
        setConnectionState('subscribed')
        setError(null)
        return
      }

      if (message.type === 'error' || message.type === 'decode-error')
        setError(message.message || `${message.type}${message.key ? `: ${message.key}` : ''}`)
    })

    const start = async () => {
      try {
        const namespace = normalizeRobotNamespace(await apiServer.fetchZenohNamespace())
        if (disposed)
          return
        setRobotNamespace(namespace)
        await window.zcDesktop?.startZenohLifecycleTransition({
          host,
          namespace,
          topics: [...NAVIGATION_TRANSITION_EVENT_TOPICS],
        })
      }
      catch (startError) {
        if (!disposed) {
          setConnectionState('error')
          setError(`${startError}`)
        }
      }
    }

    void start()

    return () => {
      disposed = true
      removeListener()
      window.zcDesktop?.stopZenohLifecycleTransition().catch((stopError) => {
        console.warn('Failed to stop Zenoh lifecycle transition bridge', stopError)
      })
    }
  }, [host, onReady])

  const restartStatus = useMemo(() => formatRestartState(restartState), [restartState])
  const receivedCount = Object.keys(events).length

  return (
    <div className="fixed z-110 inset-0 flex items-center justify-center bg-gray-900/35 px-4 py-6">
      <div className="max-h-[92vh] w-72rem max-w-[95vw] overflow-hidden rounded-2xl border-(solid 1px gray-200) bg-white shadow-xl flex flex-col">
        <div className="flex items-start gap-3 border-b-(solid 1px gray-200) px-5 py-4">
          <div className="i-material-symbols-account-tree-outline-rounded mt-0.5 text-6 text-emerald-700" />
          <div>
            <div className="text-5 font-bold">导航生命周期事件</div>
            <div className="mt-1 text-xs text-gray-500">监控导航节点重启时的 transition_event</div>
          </div>
          <button
            type="button"
            className="i-material-symbols-close-rounded ml-a text-5 text-gray-500 hover:text-gray-900"
            aria-label="关闭生命周期事件窗口"
            onClick={onClose} />
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 py-3 text-xs">
          <span className={`rounded-full px-2.5 py-1 font-bold ${restartStatus.className}`}>
            {restartStatus.label}
          </span>
          <span className={`rounded-full px-2.5 py-1 ${connectionState === 'subscribed' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
            {connectionState === 'subscribed' ? 'Zenoh 已连接' : `Zenoh: ${connectionState}`}
          </span>
          <span className="text-gray-500">已收到 {receivedCount}/{NAVIGATION_TRANSITION_EVENT_TOPICS.length}</span>
          {robotNamespace && <span className="text-gray-500">机器人命名空间: /{robotNamespace}</span>}
        </div>

        {error && (
          <div className="mx-5 mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
        )}

        <div className="overflow-auto px-5 pb-5">
          <div className="grid grid-cols-2 gap-2">
            {NAVIGATION_TRANSITION_EVENT_TOPICS.map((topic) => {
              const topicEvents = events[topic] ?? []
              const namespacedTopic = formatNamespacedTopic(robotNamespace, topic)
              return (
                <div key={topic} className="rounded-xl border-(solid 1px gray-200) px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${topicEvents.length > 0 ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-gray-800" title={namespacedTopic}>{namespacedTopic}</div>
                      {topicEvents.length === 0 && <div className="mt-1 text-xs text-gray-400">等待事件...</div>}
                      {topicEvents.map((topicEvent, index) => (
                        <div key={`${topicEvent.updatedAt}-${index}`} className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-600">
                          <span>{formatState(topicEvent.event.startState)}</span>
                          <span className="i-material-symbols-arrow-forward-rounded" />
                          <span className="font-bold text-emerald-700">{formatState(topicEvent.event.goalState)}</span>
                          <span className="text-gray-400">·</span>
                          <span>{topicEvent.event.transition.label || `Transition ${topicEvent.event.transition.id}`}</span>
                          <time className="ml-a text-gray-400">{new Date(topicEvent.updatedAt).toLocaleTimeString()}</time>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default NavigationTransitionEventsModal
