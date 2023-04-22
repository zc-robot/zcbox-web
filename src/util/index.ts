export const uid = (prefix: string) => {
  return `${prefix}-${crypto.randomUUID()}`
}
