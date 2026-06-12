import { devLog, devWarn } from '@/src/utils/safeLogger'

export default defineNuxtRouteMiddleware(async (to) => {
  // Skip auth checks on the server. The client-side plugin restores the
  // cookie-backed session before routing decisions run.
  if (import.meta.server) {
    return
  }

  const { $pinia } = useNuxtApp()
  const auth = useAuthStore($pinia)

  const needsResolvedAuth =
    to.path.startsWith('/app') ||
    to.path.startsWith('/invite') ||
    to.path === '/login' ||
    to.path === '/signup'

  // Only block navigation for routes that actually depend on resolved auth.
  if (needsResolvedAuth && auth.initPromise) {
    await auth.initPromise
  }

  if (!auth.isReady && to.path.startsWith('/app')) {
    return navigateTo('/')
  }

  // Protect /app and its children - require authentication
  // Redirect to / if not authenticated
  if (to.path.startsWith('/app')) {
    if (!auth.isAuthenticated) {
      devWarn('[auth] blocked unauthenticated access to', to.path)
      return navigateTo('/')
    }
  }

  // Login/Signup pages: if authenticated, redirect to /app (or pending invite)
  if (auth.isAuthenticated) {
    if (to.path === '/login' || to.path === '/signup') {
      // Check for a pending invite token saved before login redirect
      try {
        const pendingInvite = localStorage.getItem('kergit.pendingInvite')
        if (pendingInvite) {
          localStorage.removeItem('kergit.pendingInvite')
          devLog('[auth] resuming pending invite after login')
          return navigateTo(`/invite/${pendingInvite}`)
        }
      } catch {
        // ignore storage errors
      }
      devLog('[auth] authenticated user on auth page, redirecting to /app')
      return navigateTo('/app')
    }
  }
})
