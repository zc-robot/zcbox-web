import { useEffect } from 'react'
import { createMqttClient, decodePosePayload, teardownMqttClient } from './mqtt'
import { useGridStore } from '@/store'
import type { LaserScanMessage } from '@/types'

const LASER_POSE_TOPIC = 'laser_pose'
const SCAN_DATA_TOPIC = 'scan/filtered'
const SCAN_PING_TOPIC = 'scan/filtered/required'
const SCAN_PING_INTERVAL_MS = 5000
const SCAN_PAYLOAD_VERSION = 1
const SCAN_HEADER_SIZE = 15
const INVALID_RANGE_MM = 65535

function decodeLaserScanPayload(payload: Uint8Array): LaserScanMessage | null {
  if (payload.byteLength < SCAN_HEADER_SIZE)
    return null

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  const version = view.getUint8(0)

  if (version !== SCAN_PAYLOAD_VERSION)
    return null

  const count = view.getUint16(1, false)
  const payloadSize = SCAN_HEADER_SIZE + count * 2

  if (payload.byteLength !== payloadSize)
    return null

  const ranges = new Array<number>(count)
  for (let i = 0; i < count; i++) {
    const rangeMm = view.getUint16(SCAN_HEADER_SIZE + i * 2, false)
    ranges[i] = rangeMm === INVALID_RANGE_MM ? Number.NaN : rangeMm / 1000
  }

  return {
    angleMin: view.getFloat32(3, false),
    angleIncrement: view.getFloat32(7, false),
    rangeMin: view.getUint16(11, false) / 1000,
    rangeMax: view.getUint16(13, false) / 1000,
    ranges,
  }
}

export function useLaserScanMqtt() {
  const isScanVisible = useGridStore(state => state.isScanVisible)
  const updateLaserPose = useGridStore(state => state.updateLaserPose)
  const updateLaserScan = useGridStore(state => state.updateLaserScan)

  useEffect(() => {
    if (!isScanVisible)
      return

    const client = createMqttClient()

    const sendScanPing = () => {
      if (client.connected)
        client.publish(SCAN_PING_TOPIC, new Uint8Array(0))
    }

    const pingTaskId = window.setInterval(sendScanPing, SCAN_PING_INTERVAL_MS)

    client.on('connect', () => {
      client.subscribe(LASER_POSE_TOPIC)
      client.subscribe(SCAN_DATA_TOPIC, (error) => {
        if (!error)
          sendScanPing()
      })
    })

    client.on('message', (topic, payload) => {
      if (topic === LASER_POSE_TOPIC) {
        const pose = decodePosePayload(payload)
        if (pose)
          updateLaserPose(pose)
        return
      }

      if (topic === SCAN_DATA_TOPIC) {
        const scan = decodeLaserScanPayload(payload)
        if (scan)
          updateLaserScan(scan)
      }
    })

    return () => {
      window.clearInterval(pingTaskId)
      teardownMqttClient(client)
    }
  }, [isScanVisible, updateLaserPose, updateLaserScan])
}
