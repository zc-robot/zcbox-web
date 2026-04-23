import { useCallback, useEffect, useRef } from 'react'
import type { MqttClient } from 'mqtt'
import { createMqttClient, encodeTwistPayload } from './mqtt'
import type { TwistCommand } from './mqtt'

const CMD_VEL_TOPIC = 'cmd_vel_collision'
const ZERO_TWIST = encodeTwistPayload({})

export function useVelocityCommandMqtt() {
  const clientRef = useRef<MqttClient | null>(null)

  useEffect(() => {
    const client = createMqttClient()
    clientRef.current = client

    return () => {
      if (client.connected)
        client.publish(CMD_VEL_TOPIC, ZERO_TWIST, { qos: 0, retain: false })

      client.removeAllListeners()
      client.end(false)

      if (clientRef.current === client)
        clientRef.current = null
    }
  }, [])

  return useCallback((command: TwistCommand = {}) => {
    const client = clientRef.current
    if (!client?.connected)
      return false

    client.publish(CMD_VEL_TOPIC, encodeTwistPayload(command), { qos: 0, retain: false })
    return true
  }, [])
}
