interface RobotParameterRecord {
  id?: unknown
  content: string
}

export type RobotParameterNumericType = 'integer' | 'double'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function collectParameterRecords(value: unknown): RobotParameterRecord[] {
  if (Array.isArray(value)) {
    return value.flatMap(item => isRecord(item) && typeof item.content === 'string'
      ? [{ id: item.id, content: item.content }]
      : [])
  }

  if (!isRecord(value))
    return []

  if (typeof value.content === 'string')
    return [{ id: value.id, content: value.content }]

  return Array.isArray(value.data) ? collectParameterRecords(value.data) : []
}

function numericRecordId(record: RobotParameterRecord) {
  const id = typeof record.id === 'number' || typeof record.id === 'string'
    ? Number(record.id)
    : Number.NaN
  return Number.isFinite(id) ? id : null
}

function selectLatestRecord(records: RobotParameterRecord[]) {
  return records.reduce((latest, candidate) => {
    const latestId = numericRecordId(latest)
    const candidateId = numericRecordId(candidate)

    if (candidateId !== null && (latestId === null || candidateId >= latestId))
      return candidate
    if (candidateId === null && latestId === null)
      return candidate
    return latest
  })
}

function parseJsonResponse(source: string, responseName: string): unknown {
  const trimmedSource = source.trim()
  if (!trimmedSource)
    throw new Error(`The robot controller returned an empty ${responseName} response.`)

  if (/^<(?:!doctype\s+html|html|head|body)\b/i.test(trimmedSource))
    throw new Error('The robot controller returned a web page instead of parameter data. Check the connection and sign-in state.')

  try {
    return JSON.parse(trimmedSource)
  }
  catch {
    throw new Error(`The robot controller returned an invalid ${responseName} response.`)
  }
}

export function parseRobotParameterHeads(source: string) {
  const parsed = parseJsonResponse(source, 'parameter heads')
  const candidates = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.heads)
      ? parsed.heads
      : isRecord(parsed) && Array.isArray(parsed.data)
        ? parsed.data
        : []

  const heads = candidates
    .filter((head): head is string => typeof head === 'string')
    .map(head => head.trim())
    .filter(Boolean)
    .filter((head, index, allHeads) => allHeads.indexOf(head) === index)

  if (heads.length === 0 && candidates.length > 0)
    throw new Error('The robot controller returned parameter heads in an unsupported format.')

  return heads
}

export function normalizeRobotParametersByHeads(source: string, requestedHeads: string[]) {
  const parsed = parseJsonResponse(source, 'parameters by head')
  const hasDataEnvelope = isRecord(parsed) && isRecord(parsed.data)
  const data = hasDataEnvelope ? parsed.data : parsed
  if (!isRecord(data))
    throw new Error('The robot controller returned parameters by head in an unsupported format.')

  const missingHeads = requestedHeads.filter(head => !Object.prototype.hasOwnProperty.call(data, head))
  if (missingHeads.length > 0)
    throw new Error(`The robot controller did not return parameter head: ${missingHeads.join(', ')}`)

  // Keep the controller's original JSON numeric tokens. JSON.parse followed by
  // JSON.stringify changes 10.0 to 10, which changes a ROS double into an
  // integer when that value is later submitted to yamlUpdateValue.
  return hasDataEnvelope ? JSON.stringify(data) : source.trim()
}

function serializeNumber(value: number, numericType?: RobotParameterNumericType) {
  if (!Number.isFinite(value))
    throw new Error('Robot parameter numbers must be finite.')
  if (numericType === 'integer' && !Number.isInteger(value))
    throw new Error('Robot integer parameters must be whole numbers.')
  if (numericType === 'double' && Number.isInteger(value))
    return `${Object.is(value, -0) ? '-0' : String(value)}.0`
  return String(value)
}

function serializeParameterValue(value: unknown, numericType?: RobotParameterNumericType): string {
  if (typeof value === 'number')
    return serializeNumber(value, numericType)

  if (Array.isArray(value)) {
    return `[${value.map(item => typeof item === 'number'
      ? serializeNumber(item, numericType)
      : JSON.stringify(item)).join(',')}]`
  }

  const serialized = JSON.stringify(value)
  if (serialized === undefined)
    throw new Error('Robot parameter values cannot be undefined.')
  return serialized
}

export function serializeRobotParameterUpdateBody(
  keyPath: string,
  newValue: unknown,
  numericType?: RobotParameterNumericType,
) {
  return `{"key_path":${JSON.stringify(keyPath)},"new_value":${serializeParameterValue(newValue, numericType)}}`
}

export function extractLatestRobotParameterYaml(source: string) {
  const trimmedSource = source.trim()
  if (!trimmedSource)
    throw new Error('The robot controller returned an empty parameter response.')

  if (/^<(?:!doctype\s+html|html|head|body)\b/i.test(trimmedSource))
    throw new Error('The robot controller returned a web page instead of parameter data. Check the connection and sign-in state.')

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmedSource)
  }
  catch {
    return source
  }

  if (typeof parsed === 'string') {
    if (!parsed.trim())
      throw new Error('The robot controller returned an empty parameter document.')
    return parsed
  }

  const records = collectParameterRecords(parsed)
    .filter(record => record.content.trim().length > 0)

  if (records.length > 0)
    return selectLatestRecord(records).content

  if (Array.isArray(parsed))
    throw new Error('The robot controller returned parameter records without YAML content.')

  // Some controller versions may return the YAML mapping directly as JSON.
  return source
}
