interface BuildAlignedNav2MapYamlOptions {
  referenceYaml: string
  imageFilename: string
  imageHeight: number
  fallbackResolution?: number
}

const DEFAULT_NAV2_MAP_RESOLUTION = 0.05

function formatNumber(value: number) {
  if (!Number.isFinite(value))
    return '0'

  const rounded = Number(value.toFixed(6))
  return Object.is(rounded, -0) ? '0' : `${rounded}`
}

function parseYamlMappingValues(content: string) {
  const values = new Map<string, string>()

  content.split(/\r?\n/).forEach((line) => {
    const match = /^\s*([A-Za-z_][\w]*)\s*:\s*(.*?)\s*(?:#.*)?$/.exec(line)
    if (!match)
      return

    values.set(match[1], match[2].trim())
  })

  return values
}

function parseYamlNumber(value: string | undefined) {
  if (!value)
    return null

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function buildAlignedNav2MapYaml(options: BuildAlignedNav2MapYamlOptions) {
  const referenceValues = parseYamlMappingValues(options.referenceYaml)
  const resolution = parseYamlNumber(referenceValues.get('resolution'))
    ?? options.fallbackResolution
    ?? DEFAULT_NAV2_MAP_RESOLUTION
  const imageHeight = Math.max(1, Math.ceil(Number.isFinite(options.imageHeight) ? options.imageHeight : 1))
  const originY = -imageHeight * resolution
  const lines = [
    `image: ${options.imageFilename}`,
  ]
  const mode = referenceValues.get('mode')
  if (mode)
    lines.push(`mode: ${mode}`)

  lines.push(
    `resolution: ${formatNumber(resolution)}`,
    `origin: [0, ${formatNumber(originY)}, 0]`,
    `negate: ${referenceValues.get('negate') ?? '0'}`,
    `occupied_thresh: ${referenceValues.get('occupied_thresh') ?? '0.65'}`,
    `free_thresh: ${referenceValues.get('free_thresh') ?? '0.25'}`,
    '',
  )

  return lines.join('\n')
}
