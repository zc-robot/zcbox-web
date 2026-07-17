import { useEffect, useState } from 'react'
import { useFleetSiteNamespace } from './useFleetSiteNamespace'
import { useParamsStore } from '@/store'
import type { FleetHeaderMessage, FleetTimeMessage, RmfDoorStateMessage, RmfLiftStateMessage, RmfScheduleMarkerCacheMessage, RmfScheduleMarkerMessage, StorageAreaLayoutMessage, StorageCellStockMessage, StorageShelfMessage, StorageStateMessage } from '@/types'

const RMF_STATE_TOPICS = ['door_states', 'lift_states', 'schedule_markers', 'storage_state']

export interface RmfDoorStateValue extends RmfDoorStateMessage {
  key: string
  updatedAt: number
}

export interface RmfLiftStateValue extends RmfLiftStateMessage {
  key: string
  updatedAt: number
}

export interface RmfScheduleMarkerValue extends RmfScheduleMarkerMessage {
  key: string
  updatedAt: number
}

export interface StorageStateValue extends StorageStateMessage {
  key: string
  updatedAt: number
}

export interface FleetRmfStatesZenohState {
  connected: boolean
  status: string
  keys: string[]
  updatedAt: number | null
  doorStates: Record<string, RmfDoorStateValue>
  liftStates: Record<string, RmfLiftStateValue>
  scheduleMarkers: Record<string, Record<string, RmfScheduleMarkerValue>>
  scheduleMarkersUpdatedAt: number | null
  storageState: StorageStateValue | null
  storageUpdatedAt: number | null
  error: string | null
}

const initialState: FleetRmfStatesZenohState = {
  connected: false,
  status: 'idle',
  keys: [],
  updatedAt: null,
  doorStates: {},
  liftStates: {},
  scheduleMarkers: {},
  scheduleMarkersUpdatedAt: null,
  storageState: null,
  storageUpdatedAt: null,
  error: null,
}

function stateKey(value: string) {
  return value.trim()
}

function withScheduleMarkerMetadata(markers: RmfScheduleMarkerCacheMessage, key: string, updatedAt: number) {
  const next: Record<string, Record<string, RmfScheduleMarkerValue>> = {}
  for (const [namespace, namespaceMarkers] of Object.entries(markers)) {
    next[namespace] = {}
    for (const [markerId, marker] of Object.entries(namespaceMarkers)) {
      next[namespace][markerId] = {
        ...marker,
        key,
        updatedAt,
      }
    }
  }

  return next
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function getNumber(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value))
      return value
  }

  return 0
}

function getString(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string')
      return value
  }

  return ''
}

function getArray(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return Array.isArray(value) ? value : []
}

function normalizeStorageTime(value: unknown): FleetTimeMessage {
  const record = asRecord(value)
  return {
    sec: getNumber(record, 'sec'),
    nanosec: getNumber(record, 'nanosec'),
  }
}

function normalizeStorageHeader(value: unknown): FleetHeaderMessage {
  const record = asRecord(value)
  return {
    stamp: normalizeStorageTime(record.stamp),
    frameId: getString(record, 'frameId', 'frame_id'),
  }
}

function normalizeStorageShelf(value: unknown): StorageShelfMessage {
  const record = asRecord(value)
  return {
    shelfIndex: getNumber(record, 'shelfIndex', 'shelf_index'),
    columns: getNumber(record, 'columns'),
    rows: getNumber(record, 'rows'),
    shelfSide: getString(record, 'shelfSide', 'shelf_side'),
  }
}

function normalizeStorageArea(value: unknown): StorageAreaLayoutMessage {
  const record = asRecord(value)
  return {
    areaIndex: getNumber(record, 'areaIndex', 'area_index'),
    displayName: getString(record, 'displayName', 'display_name'),
    shelves: getArray(record, 'shelves').map(normalizeStorageShelf),
  }
}

function normalizeStorageCell(value: unknown): StorageCellStockMessage {
  const record = asRecord(value)
  return {
    cellId: getString(record, 'cellId', 'cell_id'),
    stock: getNumber(record, 'stock'),
  }
}

function normalizeStorageState(message: StorageStateMessage, updatedAt: number): StorageStateValue {
  const record = asRecord(message)
  const layout = asRecord(record.layout)

  return {
    ...message,
    key: getString(record, 'key'),
    header: normalizeStorageHeader(record.header),
    layoutRevision: getNumber(record, 'layoutRevision', 'layout_revision'),
    layout: {
      areas: getArray(layout, 'areas').map(normalizeStorageArea),
    },
    cells: getArray(record, 'cells').map(normalizeStorageCell),
    total: getNumber(record, 'total'),
    disabled: getNumber(record, 'disabled'),
    withStock: getNumber(record, 'withStock', 'with_stock'),
    updatedAt,
  }
}

export function useFleetRmfStatesZenoh() {
  const nestControllerIp = useParamsStore(state => state.nestControllerIp)
  const fleetSiteNamespace = useFleetSiteNamespace()
  const [state, setState] = useState<FleetRmfStatesZenohState>(initialState)

  useEffect(() => {
    if (!window.zcDesktop?.isDesktop || !nestControllerIp) {
      setState({
        ...initialState,
        status: window.zcDesktop?.isDesktop ? 'missing-controller' : 'desktop-only',
      })
      return
    }

    if (fleetSiteNamespace.status === 'idle' || fleetSiteNamespace.status === 'loading') {
      setState({
        ...initialState,
        status: 'loading-site-namespace',
        keys: RMF_STATE_TOPICS,
      })
      return
    }

    if (!fleetSiteNamespace.namespace) {
      setState({
        ...initialState,
        status: 'missing-site-namespace',
        keys: RMF_STATE_TOPICS,
        error: fleetSiteNamespace.error || 'Fleet site name is not configured',
      })
      window.zcDesktop.stopZenohRmfState().catch((error) => {
        console.warn('Failed to stop Zenoh RMF state bridge', error)
      })
      return
    }

    let disposed = false

    const removeListener = window.zcDesktop.onZenohRmfState((message) => {
      if (disposed)
        return

      if (message.type === 'status') {
        setState(current => ({
          ...current,
          connected: message.state === 'subscribed',
          status: message.state,
          keys: message.keys ?? current.keys,
          error: null,
        }))
        return
      }

      if (message.type === 'door-state') {
        const now = Date.now()
        const name = stateKey(message.doorName)
        if (!name)
          return

        setState(current => ({
          ...current,
          connected: true,
          status: 'subscribed',
          updatedAt: now,
          doorStates: {
            ...current.doorStates,
            [name]: {
              ...message,
              doorName: name,
              updatedAt: now,
            },
          },
          error: null,
        }))
        return
      }

      if (message.type === 'lift-state') {
        const now = Date.now()
        const name = stateKey(message.liftName)
        if (!name)
          return

        setState(current => ({
          ...current,
          connected: true,
          status: 'subscribed',
          updatedAt: now,
          liftStates: {
            ...current.liftStates,
            [name]: {
              ...message,
              liftName: name,
              updatedAt: now,
            },
          },
          error: null,
        }))
        return
      }

      if (message.type === 'schedule-markers') {
        const now = Date.now()
        setState(current => ({
          ...current,
          connected: true,
          status: 'subscribed',
          updatedAt: now,
          scheduleMarkers: withScheduleMarkerMetadata(message.markers, message.key, now),
          scheduleMarkersUpdatedAt: now,
          error: null,
        }))
        return
      }

      if (message.type === 'storage-state') {
        const now = Date.now()
        setState(current => ({
          ...current,
          connected: true,
          status: 'subscribed',
          updatedAt: now,
          storageState: normalizeStorageState(message, now),
          storageUpdatedAt: now,
          error: null,
        }))
        return
      }

      if (message.type === 'error' || message.type === 'decode-error') {
        setState(current => ({
          ...current,
          connected: false,
          status: message.type,
          error: message.message || `${message.type}${message.key ? `: ${message.key}` : ''}`,
        }))
        console.warn('Zenoh RMF state bridge:', message)
      }
    })

    const start = async () => {
      try {
        setState(current => ({
          ...current,
          status: 'starting',
          keys: RMF_STATE_TOPICS,
          error: null,
        }))
        await window.zcDesktop?.startZenohRmfState({
          host: nestControllerIp,
          namespace: fleetSiteNamespace.namespace,
          topics: RMF_STATE_TOPICS,
        })
      }
      catch (error) {
        if (disposed)
          return

        setState(current => ({
          ...current,
          connected: false,
          status: 'error',
          error: `${error}`,
        }))
        console.warn('Failed to start Zenoh RMF state bridge', error)
      }
    }

    start()

    return () => {
      disposed = true
      removeListener()
      window.zcDesktop?.stopZenohRmfState().catch((error) => {
        console.warn('Failed to stop Zenoh RMF state bridge', error)
      })
    }
  }, [fleetSiteNamespace.error, fleetSiteNamespace.namespace, fleetSiteNamespace.status, nestControllerIp])

  return state
}
