import type { FleetDiagnosticStatusMessage, FleetTimeMessage } from '../types.js'
import {
  buildRobotHardwareDiagnosticsTopic,
  normalizeRobotNamespace,
} from './robotHardwareDiagnosticsModel.js'
import type { RobotDiagnosticsEvent } from './robotHardwareDiagnosticsModel.js'

export type RobotHardwareDiagnosticsMessage =
  | { type: 'status'; state: string; keys?: string[] }
  | {
    type: 'hardware-diagnostics'
    key: string
    namespace: string
    stamp: FleetTimeMessage
    status: FleetDiagnosticStatusMessage[]
  }
  | { type: 'error' | 'decode-error' | 'log'; message?: string; key?: string }

export interface RobotHardwareDiagnosticsAdapter {
  onMessage: (callback: (message: RobotHardwareDiagnosticsMessage) => void) => () => void
  start: (options: { host: string; topics: string[] }) => Promise<{ ok: boolean }>
  stop: () => Promise<{ ok: boolean }>
}

interface RobotHardwareDiagnosticsSubscriptionOptions {
  adapter: RobotHardwareDiagnosticsAdapter
  host: string
  fetchNamespace: () => Promise<string>
  onEvent: (event: RobotDiagnosticsEvent) => void
  now?: () => number
  onStopError?: (error: unknown) => void
}

export function startRobotHardwareDiagnosticsSubscription({
  adapter,
  host,
  fetchNamespace,
  onEvent,
  now = Date.now,
  onStopError = error => console.warn('Failed to stop Robot hardware diagnostics bridge', error),
}: RobotHardwareDiagnosticsSubscriptionOptions) {
  let disposed = false
  const removeListener = adapter.onMessage((message) => {
    if (disposed)
      return

    if (message.type === 'status') {
      onEvent({
        type: 'status',
        state: message.state,
        topics: message.keys,
      })
      return
    }

    if (message.type === 'hardware-diagnostics') {
      onEvent({
        type: 'hardware-diagnostics',
        key: message.key,
        namespace: message.namespace,
        receivedAt: now(),
        diagnostics: {
          stamp: message.stamp,
          status: message.status,
        },
      })
      return
    }

    if (message.type === 'error' || message.type === 'decode-error') {
      onEvent({
        type: 'error',
        status: message.type,
        message: message.message || `${message.type}${message.key ? `: ${message.key}` : ''}`,
      })
    }
  })

  const start = async () => {
    try {
      const namespace = normalizeRobotNamespace(await fetchNamespace())
      if (disposed)
        return

      const topic = buildRobotHardwareDiagnosticsTopic(namespace)
      onEvent({ type: 'starting', topic, namespace })
      await adapter.start({ host, topics: [topic] })
    }
    catch (error) {
      if (!disposed) {
        onEvent({
          type: 'error',
          status: 'error',
          message: `${error}`,
        })
      }
    }
  }

  void start()

  return () => {
    disposed = true
    removeListener()
    adapter.stop().catch(onStopError)
  }
}
