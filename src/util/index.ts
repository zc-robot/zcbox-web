import { ReadyState } from 'react-use-websocket'
import type { RobotStatus } from '@/types'

export function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(-6)}`
}

export const wsConnectionStatus = {
  [ReadyState.CONNECTING]: 'Connecting',
  [ReadyState.OPEN]: 'Open',
  [ReadyState.CLOSING]: 'Closing',
  [ReadyState.CLOSED]: 'Closed',
  [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
}

const robotStatuses = new Set<RobotStatus>(['idle', 'moving', 'succeeded', 'failed', 'canceled'])

export function parseRobotStatus(value: unknown): RobotStatus | null {
  const status = String(value ?? '').trim()

  return robotStatuses.has(status as RobotStatus)
    ? status as RobotStatus
    : null
}

export function parseFiniteNumber(value: unknown): number | null {
  const parsed = Number(String(value ?? '').trim())

  return Number.isFinite(parsed) ? parsed : null
}
