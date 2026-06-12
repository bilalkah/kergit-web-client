import { devWarn } from '@/src/utils/safeLogger'

export default defineNuxtRouteMiddleware(async (to, from) => {
  // Skip auth checks on the server. The client-side plugin restores the
  // cookie-backed session before gating protected routes.
  if (import.meta.server) {
    return
  }

  const { $pinia } = useNuxtApp()
  const auth = useAuthStore($pinia)

  // Wait for auth initialization to complete before gating.
  if (auth.initPromise) {
    await auth.initPromise
  }

  if (!auth.isReady) {
    return navigateTo('/')
  }

  if (!auth.isAuthenticated) {
    devWarn('[middleware] unauthenticated access to', to.path)
    return navigateTo('/')
  }
})
