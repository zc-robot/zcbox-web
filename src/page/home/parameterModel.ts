import { parse } from 'yaml'

export type ParameterPrimitive = string | number | boolean | null
export type ParameterValue = ParameterPrimitive | ParameterPrimitive[]

export type ParameterValueKind = 'boolean' | 'number' | 'text' | 'list' | 'empty'

export interface RobotParameter {
  key: string
  label: string
  path: string
  value: ParameterValue
  kind: ParameterValueKind
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

function createParameter(path: string[], value: unknown): RobotParameter {
  const normalizedValue = normalizeLeafValue(value)
  const key = path.at(-1) || 'value'
  return {
    key,
    label: humanizeParameterKey(key),
    path: path.join('.'),
    value: normalizedValue,
    kind: getValueKind(normalizedValue),
  }
}

function flattenParameters(value: unknown, path: string[], output: RobotParameter[]) {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    output.push(createParameter(path, value))
    return
  }

  Object.entries(value).forEach(([key, child]) => {
    flattenParameters(child, [...path, key], output)
  })
}

export function buildParameterSections(source: string): ParameterSection[] {
  const parsed: unknown = parse(source)
  if (!isRecord(parsed))
    return parsed == null ? [] : [{ key: 'general', label: 'General', parameters: [createParameter(['value'], parsed)] }]

  const sections: ParameterSection[] = []
  const generalParameters: RobotParameter[] = []

  Object.entries(parsed).forEach(([key, value]) => {
    if (!isRecord(value)) {
      generalParameters.push(createParameter([key], value))
      return
    }

    const parameters: RobotParameter[] = []
    flattenParameters(value, [key], parameters)
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
