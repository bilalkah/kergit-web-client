import { afterEach, describe, expect, it, vi } from 'vitest'
import { devError, logServerError } from './safeLogger'

const originalNodeEnv = process.env.NODE_ENV

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv
  vi.restoreAllMocks()
})

describe('safeLogger production diagnostics', () => {
  it('logServerError emits in production so backend failures are not silently swallowed', () => {
    process.env.NODE_ENV = 'production'
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    logServerError('[delete-account] stage failed', { stage: 'request_account_deletion' })

    expect(spy).toHaveBeenCalledOnce()
  })

  it('logServerError redacts sensitive keys while keeping safe diagnostics', () => {
    process.env.NODE_ENV = 'production'
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    logServerError('[delete-account] stage failed', {
      stage: 'supabase_auth_delete',
      token: 'super-secret',
      email: 'user@example.com',
      supabaseError: { code: 'PGRST202', message: 'function not found' },
    })

    const payload = spy.mock.calls[0]?.[1] as Record<string, unknown>
    expect(payload.stage).toBe('supabase_auth_delete')
    expect(payload.token).toBe('[REDACTED]')
    expect(payload.email).toBe('[REDACTED]')
    expect(payload.supabaseError).toEqual({ code: 'PGRST202', message: 'function not found' })
  })

  it('devError stays suppressed in production (contrast: must not be the only diagnostic)', () => {
    process.env.NODE_ENV = 'production'
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    devError('[delete-account] this should not surface in prod')

    expect(spy).not.toHaveBeenCalled()
  })
})
