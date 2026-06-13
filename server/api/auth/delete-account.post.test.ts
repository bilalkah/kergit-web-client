import { readBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './delete-account.post'
import {
  clearAuthSessionCookies,
  requireSupabaseSessionFromCookies,
} from '../../utils/authSession'
import { getSupabaseAdminClient } from '../../utils/supabaseAdmin'

vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('h3')>()
  return {
    ...actual,
    readBody: vi.fn(),
  }
})

vi.mock('../../utils/authSession', () => ({
  clearAuthSessionCookies: vi.fn(),
  requireSupabaseSessionFromCookies: vi.fn(),
}))

vi.mock('../../utils/supabaseAdmin', () => ({
  getSupabaseAdminClient: vi.fn(),
}))

describe('POST /api/auth/delete-account', () => {
  const deleteUser = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(getSupabaseAdminClient).mockReturnValue({
      auth: {
        admin: {
          deleteUser,
        },
      },
    } as never)
  })

  it('rejects an unauthenticated request before reading confirmation data', async () => {
    vi.mocked(requireSupabaseSessionFromCookies).mockRejectedValue({
      statusCode: 401,
      statusMessage: 'Authentication required',
    })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Authentication required',
    })
    expect(readBody).not.toHaveBeenCalled()
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('rejects invalid email confirmation', async () => {
    vi.mocked(requireSupabaseSessionFromCookies).mockResolvedValue({
      user: {
        id: 'user-id',
        email: 'user@example.com',
      },
    } as never)
    vi.mocked(readBody).mockResolvedValue({ emailConfirmation: 'invalid' })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid email confirmation',
    })
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('rejects missing email confirmation', async () => {
    vi.mocked(requireSupabaseSessionFromCookies).mockResolvedValue({
      user: {
        id: 'user-id',
        email: 'user@example.com',
      },
    } as never)
    vi.mocked(readBody).mockResolvedValue({})

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid email confirmation',
    })
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('rejects when the restored session email is unavailable', async () => {
    vi.mocked(readBody).mockResolvedValue({ emailConfirmation: 'user@example.com' })
    vi.mocked(requireSupabaseSessionFromCookies).mockResolvedValue({
      user: {
        id: 'user-id',
      },
    } as never)

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Session email is unavailable',
    })
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('rejects when confirmation does not match the session email', async () => {
    vi.mocked(readBody).mockResolvedValue({ emailConfirmation: 'other@example.com' })
    vi.mocked(requireSupabaseSessionFromCookies).mockResolvedValue({
      user: {
        id: 'user-id',
        email: 'user@example.com',
      },
    } as never)

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Email confirmation mismatch',
    })
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('soft deletes the account and clears auth cookies', async () => {
    vi.mocked(readBody).mockResolvedValue({
      emailConfirmation: 'USER@example.com',
      userId: 'attacker-supplied-id',
    })
    vi.mocked(requireSupabaseSessionFromCookies).mockResolvedValue({
      user: {
        id: 'user-id',
        email: 'user@example.com',
      },
    } as never)
    deleteUser.mockResolvedValue({ error: null })

    await expect(handler({} as never)).resolves.toEqual({
      ok: true,
    })
    expect(deleteUser).toHaveBeenCalledWith('user-id', true)
    expect(clearAuthSessionCookies).toHaveBeenCalledOnce()
  })

  it('maps storage-related admin failures without exposing the raw error', async () => {
    vi.mocked(readBody).mockResolvedValue({ emailConfirmation: 'user@example.com' })
    vi.mocked(requireSupabaseSessionFromCookies).mockResolvedValue({
      user: {
        id: 'user-id',
        email: 'user@example.com',
      },
    } as never)
    deleteUser.mockResolvedValue({
      error: {
        status: 500,
        message: 'User owns storage objects in a private bucket',
      },
    })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Account storage cleanup required',
    })
    expect(clearAuthSessionCookies).not.toHaveBeenCalled()
  })

  it('maps other admin failures without exposing the raw error', async () => {
    vi.mocked(readBody).mockResolvedValue({ emailConfirmation: 'user@example.com' })
    vi.mocked(requireSupabaseSessionFromCookies).mockResolvedValue({
      user: {
        id: 'user-id',
        email: 'user@example.com',
      },
    } as never)
    deleteUser.mockResolvedValue({
      error: {
        status: 400,
        message: 'Internal secret details',
      },
    })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Account deletion failed',
    })
    expect(clearAuthSessionCookies).not.toHaveBeenCalled()
  })
})
