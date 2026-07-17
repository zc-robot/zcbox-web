import { isMap, isScalar, isSeq, parseDocument } from 'yaml'

export type ParameterPrimitive = string | number | boolean | null
export type ParameterValue = ParameterPrimitive | ParameterPrimitive[]

export type ParameterValueKind = 'boolean' | 'number' | 'text' | 'list' | 'empty'
export type ParameterNumericType = 'integer' | 'double'

export interface RobotParameter {
  key: string
  label: string
  path: string
  pathSegments: string[]
  value: ParameterValue
  kind: ParameterValueKind
  numericType?: ParameterNumericType
}

export interface ParameterSection {
  key: string
  label: string
  parameters: RobotParameter[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function humanizeParameterKey(key: string) {
  const uppercaseWords = new Set(['api', 'can', 'cpu', 'gps', 'gpu', 'id', 'imu', 'io', 'ip', 'lidar', 'odom', 'plc', 'ros', 'rpm', 'tf', 'urdf', 'usb', 'yaml'])
  return key
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => {
      const normalizedWord = word.toLocaleLowerCase()
      return uppercaseWords.has(normalizedWord)
        ? normalizedWord.toLocaleUpperCase()
        : normalizedWord.replace(/^\w/, character => character.toLocaleUpperCase())
    })
    .join(' ')
}

function normalizeLeafValue(value: unknown): ParameterValue {
  if (value == null)
    return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value

  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item == null || typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')
        return item
      return JSON.stringify(item)
    })
  }

  return JSON.stringify(value)
}

function getValueKind(value: ParameterValue): ParameterValueKind {
  if (Array.isArray(value))
    return 'list'
  if (value == null || value === '')
    return 'empty'
  if (typeof value === 'boolean')
    return 'boolean'
  if (typeof value === 'number')
    return 'number'
  return 'text'
}

function numericTypeKey(path: string[]) {
  return JSON.stringify(path)
}

function numericTypeFromSource(source: unknown): ParameterNumericType {
  return /[.eE]/.test(String(source)) ? 'double' : 'integer'
}

function collectNumericTypes(node: unknown, path: string[], output: Map<string, ParameterNumericType>) {
  if (isScalar(node)) {
    if (typeof node.value === 'number')
      output.set(numericTypeKey(path), numericTypeFromSource(node.source))
    return
  }

  if (isSeq(node)) {
    if (node.items.length === 0)
      return

    let sequenceNumericType: ParameterNumericType = 'integer'
    for (const item of node.items) {
      if (!isScalar(item) || typeof item.value !== 'number')
        return
      if (numericTypeFromSource(item.source) === 'double')
        sequenceNumericType = 'double'
    }
    output.set(numericTypeKey(path), sequenceNumericType)
    return
  }

  if (!isMap(node))
    return

  node.items.forEach((pair) => {
    const key = isScalar(pair.key) ? String(pair.key.value) : String(pair.key)
    collectNumericTypes(pair.value, [...path, key], output)
  })
}

function createParameter(path: string[], value: unknown, numericTypes: Map<string, ParameterNumericType>): RobotParameter {
  const normalizedValue = normalizeLeafValue(value)
  const key = path.at(-1) || 'value'
  return {
    key,
    label: humanizeParameterKey(key),
    path: path.join('.'),
    pathSegments: path,
    value: normalizedValue,
    kind: getValueKind(normalizedValue),
    numericType: numericTypes.get(numericTypeKey(path)),
  }
}

function flattenParameters(value: unknown, path: string[], output: RobotParameter[], numericTypes: Map<string, ParameterNumericType>) {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    output.push(createParameter(path, value, numericTypes))
    return
  }

  Object.entries(value).forEach(([key, child]) => {
    flattenParameters(child, [...path, key], output, numericTypes)
  })
}

export function buildParameterSections(source: string): ParameterSection[] {
  const document = parseDocument(source)
  if (document.errors.length > 0)
    throw document.errors[0]
  const parsed: unknown = document.toJS()
  const numericTypes = new Map<string, ParameterNumericType>()
  collectNumericTypes(document.contents, [], numericTypes)
  if (!isRecord(parsed))
    return parsed == null ? [] : [{ key: 'general', label: 'General', parameters: [createParameter(['value'], parsed, numericTypes)] }]

  const sections: ParameterSection[] = []
  const generalParameters: RobotParameter[] = []

  Object.entries(parsed).forEach(([key, value]) => {
    if (!isRecord(value)) {
      generalParameters.push(createParameter([key], value, numericTypes))
      return
    }

    const parameters: RobotParameter[] = []
    flattenParameters(value, [key], parameters, numericTypes)
    sections.push({
      key,
      label: humanizeParameterKey(key),
      parameters,
    })
  })

  if (generalParameters.length > 0) {
    sections.unshift({
      key: 'general',
      label: 'General',
      parameters: generalParameters,
    })
  }

  return sections
}

function searchableParameterValue(value: ParameterValue) {
  if (Array.isArray(value))
    return value.map(item => item == null ? '' : String(item)).join(' ')
  if (value == null)
    return 'empty not set'
  if (typeof value === 'boolean')
    return value ? 'true enabled on yes' : 'false disabled off no'
  return String(value)
}

export function filterParameterSections(sections: ParameterSection[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery)
    return sections

  return sections
    .map((section) => {
      const sectionMatches = `${section.key} ${section.label}`.toLocaleLowerCase().includes(normalizedQuery)
      const parameters = sectionMatches
        ? section.parameters
        : section.parameters.filter((parameter) => {
          const searchableText = [
            parameter.key,
            parameter.label,
            parameter.path,
            searchableParameterValue(parameter.value),
          ].join(' ').toLocaleLowerCase()
          return searchableText.includes(normalizedQuery)
        })

      return { ...section, parameters }
    })
    .filter(section => section.parameters.length > 0)
}

function applyNumericType(node: unknown, numericType?: ParameterNumericType) {
  if (!numericType)
    return

  const updateScalar = (scalar: { value: unknown; source?: string }) => {
    if (typeof scalar.value !== 'number')
      return
    if (numericType === 'integer' && !Number.isInteger(scalar.value))
      throw new Error('Robot integer parameters must be whole numbers.')
    scalar.source = numericType === 'double' && Number.isInteger(scalar.value)
      ? `${Object.is(scalar.value, -0) ? '-0' : String(scalar.value)}.0`
      : String(scalar.value)
  }

  if (isScalar(node)) {
    updateScalar(node)
    return
  }
  if (isSeq(node))
    node.items.forEach(item => isScalar(item) && updateScalar(item))
}

export function updateParameterValue(
  source: string,
  path: string | string[],
  value: ParameterValue,
  numericType?: ParameterNumericType,
) {
  const document = parseDocument(source)
  if (document.errors.length > 0)
    throw document.errors[0]
  const parsed: unknown = document.toJS()
  if (!isRecord(parsed))
    throw new Error('Robot parameter source must be a YAML mapping.')

  const segments = Array.isArray(path) ? path.filter(Boolean) : path.split('.').filter(Boolean)
  const displayPath = Array.isArray(path) ? path.join('.') : path
  if (segments.length === 0)
    throw new Error('Robot parameter path cannot be empty.')

  let cursor: Record<string, unknown> = parsed
  for (const segment of segments.slice(0, -1)) {
    const child = cursor[segment]
    if (!isRecord(child))
      throw new Error(`Robot parameter path was not found: ${displayPath}`)
    cursor = child
  }

  const key = segments.at(-1)!
  if (!Object.prototype.hasOwnProperty.call(cursor, key))
    throw new Error(`Robot parameter path was not found: ${displayPath}`)

  const existingNode = document.getIn(segments, true)
  if (isScalar(existingNode) && !Array.isArray(value)) {
    existingNode.value = value
    existingNode.source = typeof value === 'string' ? value : String(value)
    applyNumericType(existingNode, numericType)
  }
  else if (isSeq(existingNode) && Array.isArray(value)) {
    existingNode.items = value.map(item => document.createNode(item))
    applyNumericType(existingNode, numericType)
  }
  else {
    const valueNode = document.createNode(value)
    document.setIn(segments, valueNode)
    applyNumericType(document.getIn(segments, true), numericType)
  }
  return String(document)
}
