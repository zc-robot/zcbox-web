import { useEffect, useRef, useState } from 'react'
import { createMqttClient, teardownMqttClient } from './mqtt'
import { useGridStore } from '@/store'
import { mapWorker } from '@/util/transform'

const COMPRESSED_MAP_TOPIC = 'map/compressed'

export function useCompressedMapMqtt() {
  const setMapGrid = useGridStore(state => state.setMapGrid)
  const [connected, setConnected] = useState(false)
  const processingRef = useRef(false)
  const pendingPayloadRef = useRef<Uint8Array | null>(null)

  useEffect(() => {
    const client = createMqttClient()
    let disposed = false

    const processLatestPayload = async () => {
      if (processingRef.current)
        return

      const payload = pendingPayloadRef.current
      if (!payload)
        return

      pendingPayloadRef.current = null
      processingRef.current = true

      try {
        const map = await mapWorker.decodeCompressedMapPayload(payload)
        if (!disposed)
          setMapGrid(map.data, map.info)
      }
      catch (error) {
        console.error('Failed to decode compressed map MQTT payload', error)
      }
      finally {
        processingRef.current = false
        if (!disposed && pendingPayloadRef.current)
          processLatestPayload()
      }
    }

    client.on('connect', () => {
      setConnected(true)
      client.subscribe(COMPRESSED_MAP_TOPIC)
    })
    client.on('close', () => setConnected(false))
    client.on('offline', () => setConnected(false))
    client.on('error', () => setConnected(false))
    client.on('message', (topic, payload) => {
      if (topic !== COMPRESSED_MAP_TOPIC)
        return

      pendingPayloadRef.current = new Uint8Array(payload)
      processLatestPayload()
    })

    return () => {
      disposed = true
      setConnected(false)
      pendingPayloadRef.current = null
      teardownMqttClient(client)
    }
  }, [setMapGrid])

  return connected
}
