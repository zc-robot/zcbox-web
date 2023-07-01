import { ReadyState } from 'react-use-websocket'

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
