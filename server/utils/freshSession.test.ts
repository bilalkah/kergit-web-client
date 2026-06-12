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
    email: 'user@example.com',
  },
}

function createDependencies() {
  return {
    refreshToken: 'refresh-token',
    clearCookies: vi.fn(),
    restoreSession: vi.fn().mockResolvedValue(session),
  }
}

describe('resolveFreshSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects a missing refresh token and clears cookies', async () => {
    const dependencies = createDependencies()
    dependencies.refreshToken = undefined as never

    await expect(resolveFreshSession(dependencies)).rejects.toBeInstanceOf(
      FreshSessionAuthenticationRequiredError
    )
    expect(dependencies.clearCookies).toHaveBeenCalledOnce()
    expect(dependencies.restoreSession).not.toHaveBeenCalled()
  })

  it('restores and returns the session', async () => {
    const dependencies = createDependencies()

    const result = await resolveFreshSession(dependencies)

    expect(result).toEqual({ status: 'ok', session })
    expect(dependencies.restoreSession).toHaveBeenCalledOnce()
    expect(dependencies.clearCookies).not.toHaveBeenCalled()
  })

  it('rejects when the session cannot be restored', async () => {
    const dependencies = createDependencies()
    dependencies.restoreSession.mockResolvedValue(null)

    await expect(resolveFreshSession(dependencies)).rejects.toBeInstanceOf(
      FreshSessionAuthenticationRequiredError
    )
  })
})
