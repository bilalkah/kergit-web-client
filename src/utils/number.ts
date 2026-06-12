export function toNonNegativeInteger(input: unknown): number | null {
  const value = typeof input === 'number' ? input : Number(input)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.round(value)
}
