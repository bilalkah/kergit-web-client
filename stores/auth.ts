import { defineStore } from 'pinia'
import type { Router } from 'vue-router'
import { computed, ref, watch } from 'vue'
import {
  checkFreshSession,
  deleteCurrentAccount as deleteCurrentAccountRequest,
  logoutServerSession,
  UnauthenticatedSessionError,
} from '@/src/services/auth/http'
import type { FreshSessionResult } from '@/src/services/auth/freshSession'
import { devLog, devWarn } from '@/src/utils/safeLogger'

export interface AuthUser {
  id: string
  email?: string
}

export interface AuthSession {
  access_token: string
  expires_at: number
  user: AuthUser
}

export enum AuthBootPhase {
  Idle = 'idle',
  Checking = 'checking',
  Resuming = 'resuming',
  Done = 'done',
}

// Module-level promise + resolver for boot coordination
// Created immediately so middleware can always await it
let _initResolver: (() => void) | null = null
let _initPromise: Promise<void> | null = null

// Only create on client-side
if (import.meta.client) {
  _initPromise = new Promise<void>((resolve) => {
    _initResolver = resolve
  })
}

export const useAuthStore = defineStore('auth', () => {
  // --- state ---
  const authenticated = ref(false)
  const user = ref<AuthUser | null>(null)
  const session = ref<AuthSession | null>(null)
  const isReady = ref(false)
  const loggingOut = ref(false)  // Logout animation state

  // Boot phase for smart animation
  const bootPhase = ref<AuthBootPhase>(AuthBootPhase.Idle)
  let freshSessionRequest: Promise<FreshSessionResult | null> | null = null

  // --- derived ---
  const isAuthenticated = computed<boolean>(() =>
    authenticated.value
  )

  // Auth-only fallback handle derived from the email local-part. The real
  // username/display_name/avatar_seed come from the Kergit backend profile flow
  // (app store), never from Supabase auth metadata.
  const username = computed<string | null>(() =>
    user.value?.email?.split('@')[0]
    ?? null
  )

  const displayName = computed<string | null>(() =>
    username.value
    ?? null
  )

  const userId = computed<string | null>(() =>
    user.value?.id ?? null
  )

  // --- actions ---
  function setUser(authUser: AuthUser) {
    user.value = authUser
    if (session.value) {
      session.value = {
        ...session.value,
        user: authUser,
      }
    }
  }

  function setAuthenticated(authUser: AuthUser | null) {
    user.value = authUser
    authenticated.value = !!authUser
    if (!authUser) {
      session.value = null
    } else if (session.value) {
      session.value = {
        ...session.value,
        user: authUser,
      }
    }
    loggingOut.value = false
  }

  function setSession(authSession: AuthSession | null) {
    session.value = authSession
    setAuthenticated(authSession?.user ?? null)
  }

  function setReady(ready: boolean) {
    isReady.value = ready
  }

  /**
   * Full auth clear - used on logout, expiry, or invalid session
   */
  function clearAuth() {
    authenticated.value = false
    user.value = null
    session.value = null
  }

  async function checkAndHandleFreshSession(
    router: Router,
    options: { redirectUnauthenticated?: boolean } = {},
  ): Promise<FreshSessionResult | null> {
    if (freshSessionRequest) return freshSessionRequest

    freshSessionRequest = (async () => {
      try {
        const result = await checkFreshSession()

        setSession(result.session)
        return result
      } catch (error: unknown) {
        if (error instanceof UnauthenticatedSessionError) {
          clearAuth()
          if (options.redirectUnauthenticated) {
            await router.replace('/login')
          }
          return null
        }

        devWarn('[auth] fresh session check failed')
        return null
      } finally {
        freshSessionRequest = null
      }
    })()

    return freshSessionRequest
  }

  /**
   * Cookie-backed auth now owns persistence and token lifetime.
   * Keep these methods as no-ops so older call sites do not crash while
   * the app transitions away from browser-managed session expiry.
   */
  function touchAuthExpiry() {
    // no-op
  }

  /**
   * Backward-compatible alias for login flows.
   */
  function setAuthExpiryOnLogin() {
    touchAuthExpiry()
  }

  /**
   * Full logout - clears the server-backed session cookie and local store state.
   * This is the proper logout that should be called when user clicks "logout"
   */
  async function logout() {
    // Set logging out state for UI animation
    loggingOut.value = true
    devWarn('[auth] logout() invoked', {
      authenticated: authenticated.value,
      hasUser: !!user.value,
      loggingOut: loggingOut.value
    })

    try {
      await logoutServerSession()
    } catch (e) {
      devWarn('[auth] signOut failed', e)
    }

    // Clear store state
    clearAuth()

    devLog('[auth] logout complete')
  }

  async function deleteCurrentAccount(emailConfirmation: string) {
    await deleteCurrentAccountRequest({ emailConfirmation })
    clearAuth()
  }

  /**
   * Logout flow with transition: navigate first, then clear auth.
   */
  async function logoutWithTransition(router: Router, afterNavigate?: () => void | Promise<void>) {
    if (loggingOut.value) {
      devLog('[auth] logoutWithTransition skipped; already logging out')
      return
    }
    devWarn('[auth] logoutWithTransition start', {
      authenticated: authenticated.value,
      hasUser: !!user.value,
      currentRoute: router.currentRoute.value.fullPath
    })
    setReady(false)
    loggingOut.value = true
    try {
      await router.push('/')
      if (afterNavigate) {
        await afterNavigate()
      }
      await logout()
    } finally {
      loggingOut.value = false
      setReady(true)
    }
  }

  // --- debug hook ---
  watch(isAuthenticated, (val) => {
    devLog('[auth] isAuthenticated →', val)
  })

  return {
    // state
    authenticated,
    user,
    session,
    isReady,
    loggingOut,
    bootPhase,

    // init promise (read-only, created at module load)
    get initPromise() { return _initPromise },

    // resolver for plugin to call when init complete
    resolveInit() {
      if (_initResolver) {
        _initResolver()
        _initResolver = null
      }
    },

    // derived
    isAuthenticated,
    username,
    displayName,
    userId,

    // actions
    setUser,
    setSession,
    setAuthenticated,
    setReady,
    clearAuth,
    checkAndHandleFreshSession,
    touchAuthExpiry,
    setAuthExpiryOnLogin,
    logout,
    deleteCurrentAccount,
    logoutWithTransition,
  }
})
