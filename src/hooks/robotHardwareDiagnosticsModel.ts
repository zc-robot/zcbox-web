import type { FleetDiagnosticStateMessage } from '../types.js'

const HARDWARE_DIAGNOSTICS_TOPIC = 'diagnostics/hardware'

export interface RobotDiagnosticsState {
  connected: boolean
  status: string
  topic: string
  namespace: string
  updatedAt: number | null
  diagnostics: FleetDiagnosticStateMessage | null
  error: string | null
}

export type RobotDiagnosticsEvent =
  | { type: 'starting'; topic: string; namespace: string }
  | { type: 'status'; state: string; topics?: string[] }
  | {
    type: 'hardware-diagnostics'
    key: string
    namespace: string
    receivedAt: number
    diagnostics: FleetDiagnosticStateMessage
  }
  | { type: 'error'; status: string; message: string }

export const emptyRobotDiagnosticsState: RobotDiagnosticsState = {
  connected: false,
  status: 'idle',
  topic: '',
  namespace: '',
  updatedAt: null,
  diagnostics: null,
  error: null,
}

export function normalizeRobotNamespace(namespace: string) {
  return namespace.trim().replace(/^\/+/, '').replace(/\/+$/, '')
}

export function buildRobotHardwareDiagnosticsTopic(namespace: string) {
  const normalizedNamespace = normalizeRobotNamespace(namespace)
  return normalizedNamespace
    ? `${normalizedNamespace}/${HARDWARE_DIAGNOSTICS_TOPIC}`
    : HARDWARE_DIAGNOSTICS_TOPIC
}

export function nextRobotDiagnosticsState(
  state: RobotDiagnosticsState,
  event: RobotDiagnosticsEvent,
): RobotDiagnosticsState {
  if (event.type === 'starting') {
    return {
      ...state,
      connected: false,
      status: 'starting',
      topic: event.topic,
      namespace: event.namespace,
      error: null,
    }
  }

  if (event.type === 'status') {
    return {
      ...state,
      connected: event.state === 'subscribed',
      status: event.state,
      topic: event.topics?.[0] ?? state.topic,
      error: null,
    }
  }

  if (event.type === 'hardware-diagnostics') {
    return {
      ...state,
      connected: true,
      status: 'subscribed',
      topic: event.key,
      namespace: event.namespace,
      updatedAt: event.receivedAt,
      diagnostics: event.diagnostics,
      error: null,
    }
  }

  return {
    ...state,
    connected: false,
    status: event.status,
    error: event.message,
  }
}
