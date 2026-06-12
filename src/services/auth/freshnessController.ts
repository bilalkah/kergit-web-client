export const FRESH_SESSION_POLL_INTERVAL_MS = 15_000
export const FRESH_SESSION_POLL_MAX_DURATION_MS = 5 * 60_000

type FreshnessControllerOptions = {
  check: () => void | Promise<unknown>
  isAuthenticated: () => boolean
  hasPendingEmail: () => boolean
}

export function createAuthFreshnessController(
  options: FreshnessControllerOptions,
  browserWindow: Window = window,
  browserDocument: Document = document,
) {
  let started = false
  let pollIntervalId: number | null = null
  let pollTimeoutId: number | null = null
  let pollingExpired = false

  function stopPolling() {
    if (pollIntervalId !== null) {
      browserWindow.clearInterval(pollIntervalId)
      pollIntervalId = null
    }
    if (pollTimeoutId !== null) {
      browserWindow.clearTimeout(pollTimeoutId)
      pollTimeoutId = null
    }
  }

  function syncPolling() {
    if (!options.isAuthenticated() || !options.hasPendingEmail()) {
      stopPolling()
      pollingExpired = false
      return
    }

    if (pollIntervalId !== null || pollingExpired) return

    pollIntervalId = browserWindow.setInterval(runCheck, FRESH_SESSION_POLL_INTERVAL_MS)
    pollTimeoutId = browserWindow.setTimeout(() => {
      pollingExpired = true
      stopPolling()
    }, FRESH_SESSION_POLL_MAX_DURATION_MS)
  }

  function runCheck() {
    if (!options.isAuthenticated()) {
      stopPolling()
      return
    }

    void Promise.resolve(options.check())
      .catch(() => undefined)
      .finally(syncPolling)
  }

  function onFocus() {
    runCheck()
  }

  function onVisibilityChange() {
    if (browserDocument.visibilityState === 'visible') {
      runCheck()
    }
  }

  function start() {
    if (started) return
    started = true
    browserWindow.addEventListener('focus', onFocus)
    browserDocument.addEventListener('visibilitychange', onVisibilityChange)
    syncPolling()
  }

  function stop() {
    if (!started) return
    started = false
    browserWindow.removeEventListener('focus', onFocus)
    browserDocument.removeEventListener('visibilitychange', onVisibilityChange)
    stopPolling()
  }

  return {
    start,
    stop,
    syncPolling,
  }
}
