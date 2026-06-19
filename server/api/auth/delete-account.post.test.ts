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
    getRequestHeader: vi.fn(() => undefined),
  }
})

vi.mock('../../utils/authSession', () => ({
  clearAuthSessionCookies: vi.fn(),
  requireSupabaseSessionFromCookies: vi.fn(),
}))

vi.mock('../../utils/supabaseAdmin', () => ({
  getSupabaseAdminClient: vi.fn(),
}))

vi.mock('../../utils/accountEmail', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/accountEmail')>()
  return {
    ...actual,
    // Deterministic 64-hex digest; never derived from a stored plain email.
    computeAccountEmailHash: vi.fn(() => 'a'.repeat(64)),
  }
})

describe('POST /api/auth/delete-account', () => {
  const deleteUser = vi.fn()
  const rpc = vi.fn()
  const schema = vi.fn(() => ({ rpc }))

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(getSupabaseAdminClient).mockReturnValue({
      schema,
      auth: {
        admin: {
          deleteUser,
        },
      },
    } as never)
  })

  function mockAuthedSession(email: string | undefined) {
    vi.mocked(requireSupabaseSessionFromCookies).mockResolvedValue({
      user: {
        id: 'user-id',
        email,
      },
    } as never)
  }

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
    expect(rpc).not.toHaveBeenCalled()
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('rejects invalid email confirmation', async () => {
    mockAuthedSession('user@example.com')
    vi.mocked(readBody).mockResolvedValue({ emailConfirmation: 'invalid' })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid email confirmation',
    })
    expect(rpc).not.toHaveBeenCalled()
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('rejects when the restored session email is unavailable', async () => {
    vi.mocked(readBody).mockResolvedValue({ emailConfirmation: 'user@example.com' })
    mockAuthedSession(undefined)

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Session email is unavailable',
    })
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('rejects when confirmation does not match the session email', async () => {
    vi.mocked(readBody).mockResolvedValue({ emailConfirmation: 'other@example.com' })
    mockAuthedSession('user@example.com')

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Email confirmation mismatch',
    })
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('blocks a hub owner with 409 and does not delete the auth user', async () => {
    vi.mocked(readBody).mockResolvedValue({ emailConfirmation: 'user@example.com' })
    mockAuthedSession('user@example.com')
    rpc.mockResolvedValueOnce({
      data: { request_id: 'req-1', status: 'blocked', owned_hub_count: 2 },
      error: null,
    })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Account has owned hubs that must be handled first',
    })

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('request_account_deletion', expect.objectContaining({
      p_user_id: 'user-id',
      p_email_hash: 'a'.repeat(64),
    }))
    expect(deleteUser).not.toHaveBeenCalled()
    expect(clearAuthSessionCookies).not.toHaveBeenCalled()
  })

  it('reserves the deleted email hash and never the plain email', async () => {
    vi.mocked(readBody).mockResolvedValue({ emailConfirmation: 'user@example.com' })
    mockAuthedSession('user@example.com')
    rpc.mockResolvedValue({ data: { request_id: 'req-1', status: 'anonymized' }, error: null })
    deleteUser.mockResolvedValue({ error: null })

    await handler({} as never)

    const beginCall = rpc.mock.calls.find(call => call[0] === 'request_account_deletion')
    expect(beginCall?.[1]).toMatchObject({
      p_user_id: 'user-id',
      p_email_hash: 'a'.repeat(64),
    })
    // The plain email must not be forwarded to the DB workflow.
    expect(JSON.stringify(beginCall?.[1])).not.toContain('user@example.com')
  })

  it('runs the workflow, soft deletes with true, and clears auth cookies', async () => {
    vi.mocked(readBody).mockResolvedValue({
      emailConfirmation: 'USER@example.com',
      userId: 'attacker-supplied-id',
    })
    mockAuthedSession('user@example.com')
    rpc.mockResolvedValue({ data: { request_id: 'req-1', status: 'anonymized' }, error: null })
    deleteUser.mockResolvedValue({ error: null })

    await expect(handler({} as never)).resolves.toEqual({ ok: true })

    expect(rpc).toHaveBeenCalledWith('request_account_deletion', expect.objectContaining({
      p_user_id: 'user-id',
    }))
    expect(rpc).toHaveBeenCalledWith('complete_account_deletion', expect.objectContaining({
      p_deletion_id: 'req-1',
      p_user_id: 'user-id',
    }))
    expect(deleteUser).toHaveBeenCalledWith('user-id', true)
    expect(clearAuthSessionCookies).toHaveBeenCalledOnce()
  })

  it('maps storage-related admin failures and marks the request failed without leaking details', async () => {
    vi.mocked(readBody).mockResolvedValue({ emailConfirmation: 'user@example.com' })
    mockAuthedSession('user@example.com')
    rpc.mockResolvedValue({ data: { request_id: 'req-1', status: 'anonymized' }, error: null })
    deleteUser.mockResolvedValue({
      error: { status: 500, message: 'User owns storage objects in a private bucket' },
    })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Account storage cleanup required',
    })

    const failCall = rpc.mock.calls.find(call => call[0] === 'fail_account_deletion')
    expect(failCall?.[1]).toMatchObject({
      p_deletion_id: 'req-1',
      p_user_id: 'user-id',
      p_failure_reason: 'Supabase Auth soft delete failed',
    })
    // No raw admin error text in the failure record.
    expect(JSON.stringify(failCall?.[1])).not.toContain('storage objects')
    expect(clearAuthSessionCookies).not.toHaveBeenCalled()
  })

  it('maps other admin failures without exposing the raw error', async () => {
    vi.mocked(readBody).mockResolvedValue({ emailConfirmation: 'user@example.com' })
    mockAuthedSession('user@example.com')
    rpc.mockResolvedValue({ data: { request_id: 'req-1', status: 'anonymized' }, error: null })
    deleteUser.mockResolvedValue({
      error: { status: 400, message: 'Internal secret details' },
    })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Account deletion failed',
    })
    expect(clearAuthSessionCookies).not.toHaveBeenCalled()
  })

  it('fails closed when the workflow cannot start', async () => {
    vi.mocked(readBody).mockResolvedValue({ emailConfirmation: 'user@example.com' })
    mockAuthedSession('user@example.com')
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'db unavailable' } })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Account deletion failed',
    })
    expect(deleteUser).not.toHaveBeenCalled()
    expect(clearAuthSessionCookies).not.toHaveBeenCalled()
  })
})
