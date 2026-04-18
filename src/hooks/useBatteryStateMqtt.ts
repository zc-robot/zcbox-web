import { useEffect } from 'react'
import mqtt from 'mqtt'
import type { MqttClient } from 'mqtt'
import apiServer from '@/service/apiServer'
import { useGridStore } from '@/store'

const BATTERY_DATA_TOPIC = 'battery/data'
const BATTERY_PING_TOPIC = 'battery/sub'
const BATTERY_PING_INTERVAL_MS = 3000
const BATTERY_PAYLOAD_VERSION = 1
const BATTERY_PAYLOAD_SIZE = 35

function decodeBatteryPayload(payload: Uint8Array) {
  if (payload.byteLength !== BATTERY_PAYLOAD_SIZE)
    return null

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  const version = view.getUint8(0)

  if (version !== BATTERY_PAYLOAD_VERSION)
    return null

  return {
    battery: view.getFloat32(19, false) * 100,
    batteryCurrent: view.getFloat32(7, false),
  }
}

export function useBatteryStateMqtt() {
  const updateRobotBattery = useGridStore(state => state.updateRobotBattery)

  useEffect(() => {
    const client = mqtt.connect(apiServer.mqttWsUrl, {
      username: 'zc',
      password: '8888',
      protocolVersion: 4,
      reconnectPeriod: 2000,
      connectTimeout: 5000,
    })

    const sendBatteryPing = () => {
      if (client.connected)
        client.publish(BATTERY_PING_TOPIC, '')
    }

    const pingTaskId = window.setInterval(sendBatteryPing, BATTERY_PING_INTERVAL_MS)

    client.on('connect', () => {
      client.subscribe(BATTERY_DATA_TOPIC, (error) => {
        if (!error)
          sendBatteryPing()
      })
    })

    client.on('message', (_topic, payload) => {
      const batteryState = decodeBatteryPayload(payload)
      if (batteryState)
        updateRobotBattery(batteryState.battery, batteryState.batteryCurrent)
    })

    return () => {
      window.clearInterval(pingTaskId)
      teardownMqttClient(client)
    }
  }, [updateRobotBattery])
}

function teardownMqttClient(client: MqttClient) {
  client.removeAllListeners()
  client.end(true)
}
