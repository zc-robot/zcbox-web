import { useEffect } from 'react'
import mqtt from 'mqtt'
import type { MqttClient } from 'mqtt'
import type { PoseMessage } from '@/types'
import apiServer from '@/service/apiServer'
import { useGridStore } from '@/store'

function decodeRobotPosePayload(payload: Uint8Array): PoseMessage | null {
  if (payload.byteLength !== 12)
    return null

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  const yaw = view.getFloat32(8, false)

  return {
    position: {
      x: view.getFloat32(0, false),
      y: view.getFloat32(4, false),
      z: 0,
    },
    orientation: {
      x: 0,
      y: 0,
      z: Math.sin(yaw / 2),
      w: Math.cos(yaw / 2),
    },
    pyr: {
      yaw,
      pitch: 0,
      roll: 0,
    },
  }
}

export function useRobotPoseMqtt() {
  const updateRobotPose = useGridStore(state => state.updateRobotPose)

  useEffect(() => {
    const client = mqtt.connect(apiServer.robotPoseMqttWsUrl, {
      username: 'zc',
      password: '8888',
      protocolVersion: 4,
      reconnectPeriod: 2000,
      connectTimeout: 5000,
    })

    client.on('connect', () => {
      client.subscribe('robot_pose')
    })
    client.on('message', (_topic, payload) => {
      const pose = decodeRobotPosePayload(payload)
      if (pose)
        updateRobotPose(pose)
    })

    return () => {
      teardownMqttClient(client)
    }
  }, [updateRobotPose])
}

function teardownMqttClient(client: MqttClient) {
  client.removeAllListeners()
  client.end(true)
}
