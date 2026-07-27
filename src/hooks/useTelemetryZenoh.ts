import { useEffect, useRef, useState } from 'react'
import apiServer from '@/service/apiServer'
import { useGridStore, useParamsStore } from '@/store'
import { mapWorker } from '@/util/transform'
import { DEFAULT_LIDAR_SCAN_TOPIC } from '@/constants/lidar'

interface UseTelemetryZenohOptions {
  includeMap?: boolean
  includeScan?: boolean
  scanTopics?: string[]
}

function decodeBase64Payload(value: string) {
  const binary = atob(value)
  const payload = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i++)
    payload[i] = binary.charCodeAt(i)

  return payload
}

export function useTelemetryZenoh(options: UseTelemetryZenohOptions = {}) {
  const includeMap = options.includeMap === true
  const includeScan = options.includeScan === true
  const requestedScanTopics = includeScan
    ? (options.scanTopics?.length ? options.scanTopics : [DEFAULT_LIDAR_SCAN_TOPIC])
        .map(topic => topic.trim())
        .filter(Boolean)
    : []
  const requestedScanTopicsKey = requestedScanTopics.join('\n')
  const nestControllerIp = useParamsStore(state => state.nestControllerIp)
  const updateRobotBattery = useGridStore(state => state.updateRobotBattery)
  const updateRobotBattery2 = useGridStore(state => state.updateRobotBattery2)
  const updateLaserPose = useGridStore(state => state.updateLaserPose)
  const updateLaserScan = useGridStore(state => state.updateLaserScan)
  const updateZenohTelemetryStatus = useGridStore(state => state.updateZenohTelemetryStatus)
  const setMapGrid = useGridStore(state => state.setMapGrid)
  const [connected, setConnected] = useState(false)
  const processingMapRef = useRef(false)
  const pendingMapPayloadRef = useRef<Uint8Array | null>(null)

  useEffect(() => {
    if (!window.zcDesktop?.isDesktop || !nestControllerIp)
      return

    let disposed = false

    const processLatestMapPayload = async () => {
      if (processingMapRef.current)
        return

      const payload = pendingMapPayloadRef.current
      if (!payload)
        return

      pendingMapPayloadRef.current = null
      processingMapRef.current = true

      try {
        const map = await mapWorker.decodeCompressedMapPayload(payload)
        if (!disposed)
          setMapGrid(map.data, map.info)
      }
      catch (error) {
        console.error('Failed to decode compressed map Zenoh payload', error)
      }
      finally {
        processingMapRef.current = false
        if (!disposed && pendingMapPayloadRef.current)
          processLatestMapPayload()
      }
    }

    const removeListener = window.zcDesktop.onZenohTelemetry((message) => {
      if (disposed)
        return

      if (message.type === 'status') {
        updateZenohTelemetryStatus(message.state)
        setConnected(message.state === 'subscribed')
        return
      }

      if (message.type === 'battery') {
        updateRobotBattery(message.battery, message.batteryCurrent, message.key)
        return
      }

      if (message.type === 'battery2') {
        updateRobotBattery2(message.battery, message.batteryCurrent, message.key)
        return
      }

      if (message.type === 'laser-pose') {
        updateLaserPose(message.pose)
        return
      }

      if (message.type === 'laser-scan') {
        updateLaserScan(message.scan, message.topic ?? message.key)
        return
      }

      if (message.type === 'compressed-map' && includeMap) {
        pendingMapPayloadRef.current = decodeBase64Payload(message.payloadBase64)
        processLatestMapPayload()
        return
      }

      if (message.type === 'tf-decode-error') {
        console.warn('Zenoh telemetry bridge:', message)
        return
      }

      if (message.type === 'error' || message.type === 'decode-error') {
        updateZenohTelemetryStatus(message.type)
        setConnected(false)
        console.warn('Zenoh telemetry bridge:', message)
      }
    })

    const start = async () => {
      try {
        const namespace = await apiServer.fetchZenohNamespace()
        if (disposed)
          return

        updateZenohTelemetryStatus('starting')
        await window.zcDesktop?.startZenohTelemetry({
          host: nestControllerIp,
          namespace,
          includeMap,
          includeScan,
          scanTopics: requestedScanTopicsKey ? requestedScanTopicsKey.split('\n') : [],
        })
      }
      catch (error) {
        updateZenohTelemetryStatus('error')
        setConnected(false)
        console.warn('Failed to start Zenoh telemetry bridge', error)
      }
    }

    start()

    return () => {
      disposed = true
      setConnected(false)
      updateZenohTelemetryStatus('stopped')
      pendingMapPayloadRef.current = null
      removeListener()
      window.zcDesktop?.stopZenohTelemetry().catch((error) => {
        console.warn('Failed to stop Zenoh telemetry bridge', error)
      })
    }
  }, [
    includeMap,
    includeScan,
    requestedScanTopicsKey,
    nestControllerIp,
    setMapGrid,
    updateLaserPose,
    updateLaserScan,
    updateRobotBattery,
    updateRobotBattery2,
    updateZenohTelemetryStatus,
  ])

  return connected
}
