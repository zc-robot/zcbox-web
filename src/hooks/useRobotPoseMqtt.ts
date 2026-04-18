import { useEffect } from 'react'
import { createMqttClient, decodePosePayload, teardownMqttClient } from './mqtt'
import { useGridStore } from '@/store'

export function useRobotPoseMqtt() {
  const updateRobotPose = useGridStore(state => state.updateRobotPose)

  useEffect(() => {
    const client = createMqttClient()

    client.on('connect', () => {
      client.subscribe('robot_pose')
    })
    client.on('message', (_topic, payload) => {
      const pose = decodePosePayload(payload)
      if (pose)
        updateRobotPose(pose)
    })

    return () => {
      teardownMqttClient(client)
    }
  }, [updateRobotPose])
}
