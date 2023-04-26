export function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(-6)}`
}
