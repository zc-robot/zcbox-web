import type { BondStatusMessage } from '../types.js'

export interface FleetBondValue extends BondStatusMessage {
  namespace: string
  updatedAt: number
}

export type FleetBondValues = Record<string, Record<string, FleetBondValue>>
export type FleetBondHealth = 'healthy' | 'inactive' | 'stale'
export const FLEET_BOND_STALE_MS = 10_000

function normalizeNamespace(value: string) {
  return value.trim().replace(/^\/+/, '').replace(/\/+$/, '')
}

export function buildFleetBondTopics(
  robots: Array<{ zenohNamespace: string }>,
  fallbackNamespace = '',
) {
  const robotNamespaces = robots.map(robot => normalizeNamespace(robot.zenohNamespace || ''))
  const missingNamespaceCount = robotNamespaces.filter(namespace => !namespace).length
  const normalizedFallback = missingNamespaceCount === 1 ? normalizeNamespace(fallbackNamespace) : ''
  const namespaces = Array.from(new Set([
    ...robotNamespaces,
    normalizedFallback,
  ].filter(Boolean))).sort()
  return namespaces.map(namespace => `${namespace}/bond`)
}

export function upsertFleetBond(
  values: FleetBondValues,
  namespace: string,
  bond: BondStatusMessage,
  updatedAt: number,
): FleetBondValues {
  return {
    ...values,
    [namespace]: {
      ...values[namespace],
      [bond.id]: {
        ...bond,
        namespace,
        updatedAt,
      },
    },
  }
}

export function getFleetBondHealth(bond: FleetBondValue, now: number): FleetBondHealth {
  if (!bond.active)
    return 'inactive'

  if (now - bond.updatedAt > FLEET_BOND_STALE_MS)
    return 'stale'

  return 'healthy'
}
