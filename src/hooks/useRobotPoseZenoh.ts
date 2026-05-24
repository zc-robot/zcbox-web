import { useEffect } from 'react'
import apiServer from '@/service/apiServer'
import { useGridStore, useParamsStore } from '@/store'

function isZenohRobotPoseMessage(message: ZenohRobotPoseMessage): message is ZenohRobotPosePayloadMessage {
  return message.type === 'pose'
}

export function useRobotPoseZenoh() {
  const updateRobotPose = useGridStore(state => state.updateRobotPose)
  const nestControllerIp = useParamsStore(state => state.nestControllerIp)

  useEffect(() => {
    if (!window.zcDesktop?.isDesktop || !nestControllerIp)
      return

    let disposed = false

    const removeListener = window.zcDesktop.onZenohRobotPose((message) => {
      if (disposed)
        return

      if (isZenohRobotPoseMessage(message)) {
        updateRobotPose(message.pose)
        return
      }

      if (message.type === 'error' || message.type === 'decode-error')
        console.warn('Zenoh robot pose bridge:', message)
    })

    const start = async () => {
      try {
        const namespace = await apiServer.fetchZenohNamespace()
        if (disposed)
          return

        await window.zcDesktop?.startZenohRobotPose({
          host: nestControllerIp,
          namespace,
        })
      }
      catch (error) {
        console.warn('Failed to start Zenoh robot pose bridge', error)
      }
    }

    start()

    return () => {
      disposed = true
      removeListener()
      window.zcDesktop?.stopZenohRobotPose().catch((error) => {
        console.warn('Failed to stop Zenoh robot pose bridge', error)
      })
    }
  }, [nestControllerIp, updateRobotPose])
}
