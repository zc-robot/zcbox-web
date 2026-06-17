export function normalizeNestControllerIp(value: string) {
  const trimmed = value.trim()

  if (!trimmed)
    return ''

  const urlValue = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`

  try {
    const url = new URL(urlValue)
    return url.hostname
  }
  catch {
    return trimmed.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '')
  }
}

export function isValidIpv4(value: string) {
  const parts = value.split('.')

  return parts.length === 4 && parts.every((part) => {
    if (!/^\d+$/.test(part))
      return false

    const numericPart = Number(part)
    return numericPart >= 0 && numericPart <= 255 && String(numericPart) === part
  })
}
