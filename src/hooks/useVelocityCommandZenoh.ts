import { useCallback } from 'react'
import type { TwistCommand } from '@/types'

export function useVelocityCommandZenoh() {
  return useCallback((command: TwistCommand = {}) => {
    if (!window.zcDesktop?.isDesktop)
      return false

    window.zcDesktop.publishZenohVelocityCommand(command).catch((error) => {
      console.warn('Failed to publish Zenoh velocity command', error)
    })

    return true
  }, [])
}
