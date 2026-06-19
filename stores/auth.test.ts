import { createPinia, setActivePinia } from 'pinia'
import type { Router } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthSession } from './auth'
import { useAuthStore } from './auth'
import {
  checkFreshSession,
  deleteCurrentAccount as deleteCurrentAccountRequest,
  logoutServerSession,
  UnauthenticatedSessionError,
} from '@/src/services/auth/http'

vi.mock('@/src/services/auth/http', () => {
  class UnauthenticatedSessionError extends Error {}

  return {
    checkFreshSession: vi.fn(),
    deleteCurrentAccount: vi.fn(),
    logoutServerSession: vi.fn(),
    UnauthenticatedSessionError,
  }
})

const oldSession: AuthSession = {
  access_token: 'old-access-token',
  expires_at: 123,
  user: {
    id: 'user-id',
    email: 'old@example.com',
  },
}

describe('auth fresh session handling', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(checkFreshSession).mockReset()
    vi.mocked(deleteCurrentAccountRequest).mockReset()
  })

  it('replaces local auth state only with the authoritative returned session', async () => {
    const router = {
      replace: vi.fn(),
    } as unknown as Router
    const freshSession: AuthSession = {
      ...oldSession,
      user: {
        id: 'user-id',
        email: 'old@example.com',
      },
    }
    vi.mocked(checkFreshSession).mockResolvedValue({
      status: 'ok',
      session: freshSession,
    })
    const auth = useAuthStore()
    auth.setSession(oldSession)

    await auth.checkAndHandleFreshSession(router)

    expect(auth.session).toEqual(freshSession)
    expect(auth.user).toEqual(freshSession.user)
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('uses the existing unauthenticated redirect behavior for a 401', async () => {
    const router = {
      replace: vi.fn().mockResolvedValue(undefined),
    } as unknown as Router
    vi.mocked(checkFreshSession).mockRejectedValue(new UnauthenticatedSessionError())
    const auth = useAuthStore()
    auth.setSession(oldSession)

    await auth.checkAndHandleFreshSession(router, { redirectUnauthenticated: true })

    expect(auth.isAuthenticated).toBe(false)
    expect(router.replace).toHaveBeenCalledWith('/login')
  })

  it('clears local auth state after account deletion succeeds', async () => {
    vi.mocked(deleteCurrentAccountRequest).mockResolvedValue()
    const auth = useAuthStore()
    auth.setSession(oldSession)

    await auth.deleteCurrentAccount('old@example.com')

    expect(deleteCurrentAccountRequest).toHaveBeenCalledWith({
      emailConfirmation: 'old@example.com',
    })
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.user).toBeNull()
    expect(auth.session).toBeNull()
  })

  it('keeps local auth state when account deletion fails', async () => {
    vi.mocked(deleteCurrentAccountRequest).mockRejectedValue(new Error('delete failed'))
    const auth = useAuthStore()
    auth.setSession(oldSession)

    await expect(auth.deleteCurrentAccount('old@example.com')).rejects.toThrow('delete failed')

    expect(auth.isAuthenticated).toBe(true)
    expect(auth.session).toEqual(oldSession)
  })
})

describe('remember-session lifetime migration safety', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // The remember/session deadline is now owned by the server-backed HttpOnly
  // cookie (sliding window), so the old client-side expiry setters are no-ops.
  // Legacy call sites must remain safe and must never mutate auth state — there
  // is no stale fixed-from-login deadline left in the client to age out.
  it('keeps legacy expiry setters as safe no-ops that do not alter auth state', () => {
    const auth = useAuthStore()
    auth.setSession(oldSession)

    expect(() => auth.setAuthExpiryOnLogin()).not.toThrow()
    expect(() => auth.touchAuthExpiry()).not.toThrow()

    expect(auth.isAuthenticated).toBe(true)
    expect(auth.session).toEqual(oldSession)
  })

  it('clears auth state on explicit logout without re-extending any deadline', async () => {
    const auth = useAuthStore()
    auth.setSession(oldSession)

    await auth.logout()

    expect(logoutServerSession).toHaveBeenCalledOnce()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.session).toBeNull()
    expect(auth.user).toBeNull()
  })
})
