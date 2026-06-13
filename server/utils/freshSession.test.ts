import type { AuthSession } from '@/stores/auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FreshSessionAuthenticationRequiredError,
  resolveFreshSession,
} from './freshSession'

const session: AuthSession = {
  access_token: 'access-token',
  expires_at: 1234567890,
  user: {
    id: 'user-id',
    email: 'old@example.com',
  },
}

function createDependencies() {
  return {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    clearCookies: vi.fn(),
    getLocalEmail: vi.fn().mockResolvedValue('old@example.com'),
    getFreshEmail: vi.fn().mockResolvedValue('old@example.com'),
    restoreSession: vi.fn().mockResolvedValue(session),
  }
}

describe('resolveFreshSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects a missing session and clears cookies', async () => {
    const dependencies = createDependencies()
    dependencies.refreshToken = undefined as never

    await expect(resolveFreshSession(dependencies)).rejects.toBeInstanceOf(
      FreshSessionAuthenticationRequiredError
    )
    expect(dependencies.clearCookies).toHaveBeenCalledOnce()
  })

  it('uses the authoritative user email and returns an unchanged session', async () => {
    const dependencies = createDependencies()

    const result = await resolveFreshSession(dependencies)

    expect(dependencies.getFreshEmail).toHaveBeenCalledWith('access-token')
    expect(result).toEqual({
      status: 'ok',
      session,
    })
    expect(dependencies.clearCookies).not.toHaveBeenCalled()
  })

  it('clears cookies and returns stale_session when authoritative email differs', async () => {
    const dependencies = createDependencies()
    dependencies.getFreshEmail.mockResolvedValue('new@example.com')

    const result = await resolveFreshSession(dependencies)

    expect(result).toEqual({
      status: 'stale_session',
      reason: 'email_changed',
      action: 'force_relogin',
    })
    expect(dependencies.clearCookies).toHaveBeenCalledOnce()
    expect(dependencies.restoreSession).not.toHaveBeenCalled()
  })

  it('falls back to session restore when the access token cannot be inspected', async () => {
    const dependencies = createDependencies()
    dependencies.getLocalEmail.mockRejectedValue(new Error('expired access token'))

    await expect(resolveFreshSession(dependencies)).resolves.toEqual({
      status: 'ok',
      session,
    })
    expect(dependencies.restoreSession).toHaveBeenCalledOnce()
  })
})
