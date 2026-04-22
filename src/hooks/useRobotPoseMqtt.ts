import { useEffect } from 'react'
import type { MqttClient } from 'mqtt'
import { createMqttClient, decodePosePayload, teardownMqttClient } from './mqtt'
import { useGridStore } from '@/store'

const ROBOT_POSE_TOPIC = 'robot_pose'
const ROBOT_POSE_STALE_MS = 7000
const ROBOT_POSE_WATCHDOG_MS = 3000

export function useRobotPoseMqtt() {
  const updateRobotPose = useGridStore(state => state.updateRobotPose)

  useEffect(() => {
    let client: MqttClient | null = null
    let disposed = false
    let lastMessageAt = 0

    const startClient = () => {
      const nextClient = createMqttClient()
      client = nextClient

      nextClient.on('connect', () => {
        lastMessageAt = Date.now()
        nextClient.subscribe(ROBOT_POSE_TOPIC)
      })
      nextClient.on('message', (topic, payload) => {
        if (topic !== ROBOT_POSE_TOPIC)
          return

        const pose = decodePosePayload(payload)
        if (!pose)
          return

        lastMessageAt = Date.now()
        updateRobotPose(pose)
      })
    }

    const restartClient = () => {
      if (!client)
        return

      const staleClient = client
      client = null
      teardownMqttClient(staleClient)
      if (!disposed)
        startClient()
    }

    startClient()

    const watchdogTaskId = window.setInterval(() => {
      if (!client?.connected || lastMessageAt === 0)
        return

      if (Date.now() - lastMessageAt > ROBOT_POSE_STALE_MS)
        restartClient()
    }, ROBOT_POSE_WATCHDOG_MS)

    return () => {
      disposed = true
      window.clearInterval(watchdogTaskId)
      if (client)
        teardownMqttClient(client)
    }
  }, [updateRobotPose])
}
