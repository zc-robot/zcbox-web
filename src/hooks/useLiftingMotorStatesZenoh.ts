import { useEffect, useState } from 'react'
import apiServer from '@/service/apiServer'
import { useParamsStore } from '@/store'
import type { MotorStatesMessage } from '@/types'

const LIFTING_MOTOR_STATE_TOPIC = 'lifting_motor/states'

interface LiftingMotorStatesZenohState {
  connected: boolean
  status: string
  key: string
  updatedAt: number | null
  message: MotorStatesMessage | null
  error: string | null
}

const initialState: LiftingMotorStatesZenohState = {
  connected: false,
  status: 'idle',
  key: '',
  updatedAt: null,
  message: null,
  error: null,
}

export function useLiftingMotorStatesZenoh() {
  const nestControllerIp = useParamsStore(state => state.nestControllerIp)
  const [state, setState] = useState<LiftingMotorStatesZenohState>(initialState)

  useEffect(() => {
    if (!window.zcDesktop?.isDesktop || !nestControllerIp) {
      setState({
        ...initialState,
        status: window.zcDesktop?.isDesktop ? 'missing-controller' : 'desktop-only',
      })
      return
    }

    let disposed = false

    const removeListener = window.zcDesktop.onZenohMotorStates((message) => {
      if (disposed)
        return

      if (message.type === 'status') {
        setState(current => ({
          ...current,
          connected: message.state === 'subscribed',
          status: message.state,
          error: null,
        }))
        return
      }

      if (message.type === 'motor-states') {
        setState(current => ({
          ...current,
          connected: true,
          status: 'subscribed',
          key: message.key,
          updatedAt: Date.now(),
          message,
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
        console.warn('Zenoh lifting motor states bridge:', message)
      }
    })

    const start = async () => {
      try {
        const namespace = await apiServer.fetchZenohNamespace()
        if (disposed)
          return

        setState(current => ({ ...current, status: 'starting', error: null }))
        await window.zcDesktop?.startZenohMotorStates({
          host: nestControllerIp,
          namespace,
          topics: [LIFTING_MOTOR_STATE_TOPIC],
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
        console.warn('Failed to start Zenoh lifting motor states bridge', error)
      }
    }

    start()

    return () => {
      disposed = true
      removeListener()
      window.zcDesktop?.stopZenohMotorStates().catch((error) => {
        console.warn('Failed to stop Zenoh lifting motor states bridge', error)
      })
    }
  }, [nestControllerIp])

  return state
}
