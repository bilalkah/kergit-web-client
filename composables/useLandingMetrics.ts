import { toNonNegativeInteger } from '@/src/utils/number'
import { monotonicNowMs } from '@/src/utils/time'

export function useLandingMetrics() {
  function normalizeMetricValue(input: unknown): number | null {
    return toNonNegativeInteger(input)
  }

  function normalizeMetricCount(input: unknown): number {
    return normalizeMetricValue(input) ?? 0
  }

  async function fetchPingRoundTripMs(): Promise<number | null> {
    const startedAtMs = monotonicNowMs()
    try {
      await $fetch('/api/landing/ping', {
        cache: 'no-store',
        query: { t: Date.now() },
      })
      return normalizeMetricValue(monotonicNowMs() - startedAtMs)
    } catch {
      return null
    }
  }

  return {
    fetchPingRoundTripMs,
    normalizeMetricValue,
    normalizeMetricCount,
  }
}
