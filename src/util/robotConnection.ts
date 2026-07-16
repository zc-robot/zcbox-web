export const UNKNOWN_ROBOT_NAME = 'Unknown'
export const MAX_CONNECTION_HOST_HISTORY = 8

export interface ConnectionHostHistoryEntry {
  ip: string
  name: string
}

interface BindConnectionHistoryOptions {
  preserveExistingName?: boolean
}

function normalizeRobotName(value: unknown) {
  if (typeof value !== 'string')
    return UNKNOWN_ROBOT_NAME

  const normalizedName = value.trim()
  if (!normalizedName || normalizedName.startsWith('<'))
    return UNKNOWN_ROBOT_NAME

  return normalizedName
}

function readRobotName(value: unknown) {
  if (typeof value === 'string')
    return normalizeRobotName(value)
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return UNKNOWN_ROBOT_NAME

  const record = value as Record<string, unknown>
  return normalizeRobotName(record.robot_name ?? record.robotName ?? record.name)
}

export function parseRobotNameResponse(payload: unknown) {
  if (typeof payload === 'string')
    return normalizeRobotName(payload)
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return UNKNOWN_ROBOT_NAME

  const response = payload as Record<string, unknown>
  if ((typeof response.code === 'number' && response.code !== 0) || response.ok === false || response.success === false)
    return UNKNOWN_ROBOT_NAME

  const dataName = readRobotName(response.data)
  return dataName === UNKNOWN_ROBOT_NAME
    ? readRobotName(response)
    : dataName
}

export function normalizeConnectionHistory(history: unknown): ConnectionHostHistoryEntry[] {
  if (!Array.isArray(history))
    return []

  const entries: ConnectionHostHistoryEntry[] = []
  const seenIps = new Set<string>()

  for (const value of history) {
    const ip = typeof value === 'string'
      ? value.trim()
      : value && typeof value === 'object' && !Array.isArray(value)
        ? String((value as Record<string, unknown>).ip ?? '').trim()
        : ''

    if (!ip || seenIps.has(ip))
      continue

    const name = typeof value === 'string'
      ? UNKNOWN_ROBOT_NAME
      : normalizeRobotName((value as Record<string, unknown>).name)

    entries.push({ ip, name })
    seenIps.add(ip)

    if (entries.length === MAX_CONNECTION_HOST_HISTORY)
      break
  }

  return entries
}

export function bindConnectionHistory(
  history: unknown,
  ip: string,
  name: string,
  options: BindConnectionHistoryOptions = {},
) {
  const normalizedIp = ip.trim()
  if (!normalizedIp)
    return normalizeConnectionHistory(history)

  const historyEntries = normalizeConnectionHistory(history)
  const existingName = options.preserveExistingName
    ? historyEntries.find(entry => entry.ip === normalizedIp)?.name
    : undefined

  return [
    { ip: normalizedIp, name: existingName ?? normalizeRobotName(name) },
    ...historyEntries.filter(entry => entry.ip !== normalizedIp),
  ].slice(0, MAX_CONNECTION_HOST_HISTORY)
}
