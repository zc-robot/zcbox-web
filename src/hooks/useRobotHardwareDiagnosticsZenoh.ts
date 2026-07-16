import { useEffect, useState } from 'react'
import {
  emptyRobotDiagnosticsState,
  nextRobotDiagnosticsState,
} from './robotHardwareDiagnosticsModel'
import type { RobotDiagnosticsState } from './robotHardwareDiagnosticsModel'
import { startRobotHardwareDiagnosticsSubscription } from './robotHardwareDiagnosticsSubscription'
import apiServer from '@/service/apiServer'
import { useParamsStore } from '@/store'

export function useRobotHardwareDiagnosticsZenoh(): RobotDiagnosticsState {
  const nestControllerIp = useParamsStore(state => state.nestControllerIp)
  const [state, setState] = useState<RobotDiagnosticsState>(emptyRobotDiagnosticsState)

  useEffect(() => {
    if (!window.zcDesktop?.isDesktop || !nestControllerIp) {
      setState({
        ...emptyRobotDiagnosticsState,
        status: 'unavailable',
        error: window.zcDesktop?.isDesktop
          ? 'No Robot Controller is connected.'
          : 'Hardware diagnostics are available in the desktop app.',
      })
      return
    }

    return startRobotHardwareDiagnosticsSubscription({
      adapter: {
        onMessage: callback => window.zcDesktop!.onZenohHardwareDiagnostics(message => callback(message)),
        start: options => window.zcDesktop!.startZenohHardwareDiagnostics(options),
        stop: () => window.zcDesktop!.stopZenohHardwareDiagnostics(),
      },
      host: nestControllerIp,
      fetchNamespace: () => apiServer.fetchZenohNamespace(),
      onEvent: (event) => {
        if (event.type === 'error')
          console.warn('Robot hardware diagnostics bridge:', event.message)
        setState(current => nextRobotDiagnosticsState(current, event))
      },
    })
  }, [nestControllerIp])

  return state
}
