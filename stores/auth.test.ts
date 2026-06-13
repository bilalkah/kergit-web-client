import { createPinia, setActivePinia } from 'pinia'
import type { Router } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthSession } from './auth'
import { useAuthStore } from './auth'
import {
  checkFreshSession,
  UnauthenticatedSessionError,
} from '@/src/services/auth/http'

vi.mock('@/src/services/auth/http', () => {
  class UnauthenticatedSessionError extends Error {}

  return {
    checkFreshSession: vi.fn(),
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
    new_email: 'new@example.com',
  },
}

describe('auth fresh session handling', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(checkFreshSession).mockReset()
  })

  it('clears local auth and redirects when the server reports a stale email session', async () => {
    const router = {
      replace: vi.fn().mockResolvedValue(undefined),
    } as unknown as Router
    vi.mocked(checkFreshSession).mockResolvedValue({
      status: 'stale_session',
      reason: 'email_changed',
      action: 'force_relogin',
    })
    const auth = useAuthStore()
    auth.setSession(oldSession)

    await auth.checkAndHandleFreshSession(router)

    expect(auth.isAuthenticated).toBe(false)
    expect(auth.session).toBeNull()
    expect(router.replace).toHaveBeenCalledWith('/login?email_change=success')
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
})
