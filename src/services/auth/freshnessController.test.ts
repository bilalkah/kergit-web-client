import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAuthFreshnessController,
  FRESH_SESSION_POLL_INTERVAL_MS,
  FRESH_SESSION_POLL_MAX_DURATION_MS,
} from './freshnessController'

describe('auth freshness controller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('polls every 15 seconds only while a pending email exists', async () => {
    let pendingEmail = true
    const check = vi.fn()
    const controller = createAuthFreshnessController({
      check,
      isAuthenticated: () => true,
      hasPendingEmail: () => pendingEmail,
    })

    controller.start()
    await vi.advanceTimersByTimeAsync(FRESH_SESSION_POLL_INTERVAL_MS - 1)
    expect(check).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(check).toHaveBeenCalledTimes(1)

    pendingEmail = false
    controller.syncPolling()
    await vi.advanceTimersByTimeAsync(FRESH_SESSION_POLL_INTERVAL_MS * 2)
    expect(check).toHaveBeenCalledTimes(1)
    controller.stop()
  })

  it('stops pending-email polling after five minutes', async () => {
    const check = vi.fn()
    const controller = createAuthFreshnessController({
      check,
      isAuthenticated: () => true,
      hasPendingEmail: () => true,
    })

    controller.start()
    await vi.advanceTimersByTimeAsync(FRESH_SESSION_POLL_MAX_DURATION_MS)
    const callsAtTimeout = check.mock.calls.length
    expect(callsAtTimeout).toBeGreaterThan(0)

    await vi.advanceTimersByTimeAsync(FRESH_SESSION_POLL_INTERVAL_MS * 2)
    expect(check).toHaveBeenCalledTimes(callsAtTimeout)
    controller.stop()
  })

  it('checks on focus and when the document becomes visible', async () => {
    const check = vi.fn()
    const controller = createAuthFreshnessController({
      check,
      isAuthenticated: () => true,
      hasPendingEmail: () => false,
    })

    controller.start()
    window.dispatchEvent(new Event('focus'))
    await Promise.resolve()
    expect(check).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
    document.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve()
    expect(check).toHaveBeenCalledTimes(2)
    controller.stop()
  })
})
