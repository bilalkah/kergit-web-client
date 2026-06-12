const MEDIAN_EVEN_LENGTH_DIVISOR = 2

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middleIndex = Math.floor(sorted.length / MEDIAN_EVEN_LENGTH_DIVISOR)

  if (sorted.length % MEDIAN_EVEN_LENGTH_DIVISOR === 0) {
    const lower = sorted[middleIndex - 1]
    const upper = sorted[middleIndex]
    if (lower === undefined || upper === undefined) return 0
    return Math.round((lower + upper) / MEDIAN_EVEN_LENGTH_DIVISOR)
  }

  return sorted[middleIndex] ?? 0
}
