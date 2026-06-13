import { devLog, devWarn } from '@/src/utils/safeLogger'
import { AUTH_REDIRECT_FLOW_PARAM } from '@/src/utils/authRedirectState'
import { EMAIL_CHANGE_CONFIRMATION_ACCEPTED_MESSAGE } from '@/src/utils/authCallback'

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
    const hashParams = new URLSearchParams(to.hash.replace(/^#/, ''))
    const hashType = hashParams.get('type')
    const hashMessage = hashParams.get('message')
    const isEmailChangeCallback =
      to.path === '/login' &&
      (
        to.query[AUTH_REDIRECT_FLOW_PARAM] === 'email-change' ||
        hashType === 'email_change' ||
        hashMessage === EMAIL_CHANGE_CONFIRMATION_ACCEPTED_MESSAGE
      )

    if ((to.path === '/login' || to.path === '/signup') && !isEmailChangeCallback) {
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
