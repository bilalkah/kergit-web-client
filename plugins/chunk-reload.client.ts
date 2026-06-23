import { devError, devWarn } from '@/src/utils/safeLogger'

/**
 * Recover gracefully from stale dynamic-import chunks after a deploy.
 *
 * When the web app is rebuilt, the hashed `_nuxt/*.js` chunk names change and the old
 * files are removed. A browser tab that was opened before the deploy (or served stale HTML
 * from a CDN edge) still references the old chunk names; the next lazy route/component
 * import then fails with "Failed to fetch dynamically imported module", which Nuxt renders
 * as a hard 500. Instead we reload the page once to pull the fresh build.
 *
 * Guarded with a sessionStorage timestamp so a genuinely missing/broken asset can never
 * cause an infinite reload loop.
 */
const RELOAD_GUARD_KEY = 'kergit:chunk-reloaded-at'
const RELOAD_MIN_INTERVAL_MS = 10_000

function reloadForChunkError(error: unknown): void {
  if (!import.meta.client) return

  const now = Date.now()
  let last = 0
  try {
    last = Number(window.sessionStorage.getItem(RELOAD_GUARD_KEY) ?? '0')
  } catch {
    // sessionStorage unavailable (private mode / blocked) — fall through and reload once.
  }

  if (now - last < RELOAD_MIN_INTERVAL_MS) {
    // Already reloaded very recently; the asset is genuinely unreachable. Don't loop.
    devError('[chunk-reload] chunk load failed again after reload — not reloading', error)
    return
  }

  try {
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(now))
  } catch {
    // ignore storage failures
  }

  devWarn('[chunk-reload] stale chunk after deploy — reloading to fetch fresh build', error)
  const path = window.location.pathname + window.location.search + window.location.hash
  reloadNuxtApp({ path, persistState: false })
}

export default defineNuxtPlugin((nuxtApp) => {
  // Nuxt's own signal for a failed route/component chunk import.
  nuxtApp.hook('app:chunkError', ({ error }) => {
    reloadForChunkError(error)
  })

  // Vite emits this on the window when a module *preload* fails (e.g. during hydration),
  // which `app:chunkError` does not always cover. Prevent the default unhandled error.
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
    reloadForChunkError((event as unknown as { payload?: unknown }).payload)
  })
})
