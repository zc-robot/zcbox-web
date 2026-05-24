import { useEffect } from 'react'
import apiServer from '@/service/apiServer'
import { useGridStore, useParamsStore } from '@/store'

const POINT_CLOUD_TOPICS = [
  'depth/points/filtered',
  'depth/points',
  'yolo/detections_pointcloud',
]

function isZenohPointCloudMessage(message: ZenohPointCloudMessage): message is ZenohPointCloudPayloadMessage {
  return message.type === 'pointcloud'
}

export function usePointCloudZenoh() {
  const isPointCloudVisible = useGridStore(state => state.isPointCloudVisible)
  const updatePointCloud = useGridStore(state => state.updatePointCloud)
  const nestControllerIp = useParamsStore(state => state.nestControllerIp)

  useEffect(() => {
    if (!window.zcDesktop?.isDesktop || !nestControllerIp || !isPointCloudVisible)
      return

    let disposed = false

    const removeListener = window.zcDesktop.onZenohPointCloud((message) => {
      if (disposed)
        return

      if (isZenohPointCloudMessage(message)) {
        updatePointCloud(message)
        return
      }

      if (message.type === 'error' || message.type === 'decode-error')
        console.warn('Zenoh pointcloud bridge:', message)
    })

    const start = async () => {
      try {
        const namespace = await apiServer.fetchZenohNamespace()
        if (disposed)
          return

        await window.zcDesktop?.startZenohPointCloud({
          host: nestControllerIp,
          namespace,
          topics: POINT_CLOUD_TOPICS,
          maxPoints: 3500,
          minIntervalMs: 250,
        })
      }
      catch (error) {
        console.warn('Failed to start Zenoh pointcloud bridge', error)
      }
    }

    start()

    return () => {
      disposed = true
      removeListener()
      window.zcDesktop?.stopZenohPointCloud().catch((error) => {
        console.warn('Failed to stop Zenoh pointcloud bridge', error)
      })
    }
  }, [isPointCloudVisible, nestControllerIp, updatePointCloud])
}
