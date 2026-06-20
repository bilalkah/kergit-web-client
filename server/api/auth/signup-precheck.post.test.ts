import { readBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './signup-precheck.post'
import { getSupabaseAdminClient } from '../../utils/supabaseAdmin'

vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('h3')>()
  return {
    ...actual,
    readBody: vi.fn(),
  }
})

vi.mock('../../utils/supabaseAdmin', () => ({
  getSupabaseAdminClient: vi.fn(),
}))

vi.mock('../../utils/accountEmail', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/accountEmail')>()
  return {
    ...actual,
    computeAccountEmailHash: vi.fn(() => 'b'.repeat(64)),
  }
})

describe('POST /api/auth/signup-precheck', () => {
  const rpc = vi.fn()
  const limit = vi.fn()
  const eq = vi.fn(() => ({ limit }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))

  beforeEach(() => {
    vi.clearAllMocks()
    limit.mockResolvedValue({ data: [], error: null })
    vi.mocked(getSupabaseAdminClient).mockReturnValue({
      schema: vi.fn(() => ({ rpc, from })),
    } as never)
  })

  it('rejects an invalid email', async () => {
    vi.mocked(readBody).mockResolvedValue({ email: 'not-an-email' })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid email',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects an already-taken username before checking email', async () => {
    vi.mocked(readBody).mockResolvedValue({ email: 'user@example.com', username: 'AliVeli' })
    limit.mockResolvedValue({ data: [{ user_id: 'existing' }], error: null })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Username is not available',
      data: { reason: 'username_taken' },
    })
    // user_name is queried lowercased; email reservation is not reached.
    expect(eq).toHaveBeenCalledWith('user_name', 'aliveli')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects an email reserved by a deleted account', async () => {
    vi.mocked(readBody).mockResolvedValue({ email: 'USER@example.com', username: 'freehandle' })
    rpc.mockResolvedValue({ data: true, error: null })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Email is not available',
      data: { reason: 'email_reserved' },
    })
    expect(rpc).toHaveBeenCalledWith('is_email_reserved', { p_email_hash: 'b'.repeat(64) })
  })

  it('allows an available username and email', async () => {
    vi.mocked(readBody).mockResolvedValue({ email: 'user@example.com', username: 'freehandle' })
    rpc.mockResolvedValue({ data: false, error: null })

    await expect(handler({} as never)).resolves.toEqual({ available: true })
  })

  it('continues to the email check when username availability is unavailable', async () => {
    vi.mocked(readBody).mockResolvedValue({ email: 'user@example.com', username: 'freehandle' })
    limit.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    rpc.mockResolvedValue({ data: false, error: null })

    // Username lookup failure must not block signup; the email reservation still runs.
    await expect(handler({} as never)).resolves.toEqual({ available: true })
    expect(rpc).toHaveBeenCalledWith('is_email_reserved', { p_email_hash: 'b'.repeat(64) })
  })

  it('fails closed when the reservation check errors', async () => {
    vi.mocked(readBody).mockResolvedValue({ email: 'user@example.com', username: 'freehandle' })
    rpc.mockResolvedValue({ data: null, error: { message: 'db unavailable' } })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Signup precheck failed',
    })
  })

  it('logs the reservation failure via safe diagnostics (route-tagged, secrets redacted)', async () => {
    vi.mocked(readBody).mockResolvedValue({ email: 'user@example.com', username: 'freehandle' })
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST301', status: 500, message: 'denied for admin@example.com' },
    })

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(handler({} as never)).rejects.toMatchObject({ statusCode: 500 })

      const call = spy.mock.calls.find(c => c[0] === '[auth/signup-precheck] failed')
      expect(call).toBeDefined()
      const payload = call?.[1] as Record<string, any>
      expect(payload.route).toBe('auth/signup-precheck')
      expect(payload.stage).toBe('is_email_reserved')
      expect(payload.error.code).toBe('PGRST301')
      expect(payload.error.status).toBe(500)
      expect(JSON.stringify(payload)).not.toContain('admin@example.com')
    } finally {
      vi.restoreAllMocks()
    }
  })
})
