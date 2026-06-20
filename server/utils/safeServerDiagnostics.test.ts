import { describe, expect, it, vi } from 'vitest'
import {
  REDACTED,
  describeSafeServerError,
  describeSafeSupabaseError,
  logSafeServerFailure,
  redactDiagnosticString,
  redactDiagnosticValue,
} from './safeServerDiagnostics'

const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'

describe('redactDiagnosticString', () => {
  it('redacts bearer tokens, JWTs, emails and long credentials', () => {
    const out = redactDiagnosticString(
      `auth Bearer abc.DEF-123 for user@example.com with ${JWT} and key ${'a'.repeat(50)}`,
    )
    expect(out).not.toContain('user@example.com')
    expect(out).not.toContain('eyJhbGci')
    expect(out).not.toContain('Bearer abc')
    expect(out).not.toContain('a'.repeat(50))
    expect(out).toContain(REDACTED)
  })

  it('redacts URL query params that imply credentials', () => {
    const out = redactDiagnosticString('https://x.test/cb?code=SECRETCODE123&token=abc&page=2')
    expect(out).not.toContain('SECRETCODE123')
    expect(out).not.toContain('token=abc')
    expect(out).toContain('page=2')
  })

  it('preserves safe SQL error text', () => {
    const msg = 'Could not find the function kergit_app.request_account_deletion(uuid, text) in schema cache'
    expect(redactDiagnosticString(msg)).toBe(msg)
  })

  it('truncates very long (non-credential) strings', () => {
    // Spaces break the long-credential pattern, so this survives redaction and
    // exercises the length bound. (A single 500-char run would be fully redacted.)
    const out = redactDiagnosticString('word '.repeat(100))
    expect(out.length).toBeLessThanOrEqual(300 + '…[truncated]'.length)
    expect(out.endsWith('…[truncated]')).toBe(true)
  })
})

describe('describeSafeServerError', () => {
  it('redacts token/email content from a raw Error message and keeps name', () => {
    const error = new Error(`login failed for user@example.com token ${JWT}`)
    const safe = describeSafeServerError(error)
    expect(safe.name).toBe('Error')
    expect(safe.message).not.toContain('user@example.com')
    expect(safe.message).not.toContain('eyJhbGci')
    expect(safe.message).toContain(REDACTED)
  })

  it('keeps statusCode/status/code on h3-style errors', () => {
    const safe = describeSafeServerError({ statusCode: 500, code: 'X', message: 'boom' })
    expect(safe.statusCode).toBe(500)
    expect(safe.code).toBe('X')
    expect(safe.message).toBe('boom')
  })

  it('falls back to type info for non-error values', () => {
    expect(describeSafeServerError(42)).toEqual({ name: '[number]' })
    expect(describeSafeServerError('raw string')).toEqual({ message: 'raw string' })
  })

  it('redacts an untrusted code from an unknown error', () => {
    const safe = describeSafeServerError({ code: 'leaked user@example.com here', message: 'x' })
    expect(safe.code).not.toContain('user@example.com')
    expect(safe.code).toContain(REDACTED)
  })
})

describe('describeSafeSupabaseError', () => {
  it('preserves provider code and status, redacts message/details/hint', () => {
    const safe = describeSafeSupabaseError({
      code: 'PGRST202',
      status: 404,
      message: 'No function matches request_account_deletion for user@example.com',
      details: `secret ${'b'.repeat(50)}`,
      hint: 'check signature',
    })
    expect(safe.code).toBe('PGRST202')
    expect(safe.status).toBe(404)
    expect(safe.message).not.toContain('user@example.com')
    expect(safe.details).not.toContain('b'.repeat(50))
    expect(safe.hint).toBe('check signature')
  })

  it('coerces numeric codes and survives non-object input', () => {
    expect(describeSafeSupabaseError({ code: 23505, status: 409 })).toEqual({
      code: '23505',
      status: 409,
    })
    expect(describeSafeSupabaseError(null)).toEqual({ name: '[object]' })
  })

  it('preserves normal provider codes verbatim', () => {
    for (const code of ['PGRST202', '42703', '23505', '429']) {
      expect(describeSafeSupabaseError({ code, status: 500 }).code).toBe(code)
    }
  })

  it('redacts suspicious provider codes', () => {
    const safe = describeSafeSupabaseError({
      code: 'leaked user@example.com token eyJhbGciOiJIUzI1NiJ9.x.y',
      status: 500,
    })

    expect(safe.code).not.toContain('user@example.com')
    expect(safe.code).not.toContain('eyJhbGci')
    expect(safe.code).toContain(REDACTED)
  })
})

describe('redactDiagnosticValue', () => {
  it('replaces dangerous keys recursively with [REDACTED]', () => {
    const out = redactDiagnosticValue({
      authorization: 'Bearer x',
      cookie: 'a=b',
      'set-cookie': 'kergit_at=...',
      access_token: 'at',
      refresh_token: 'rt',
      password: 'p',
      secret: 's',
      serviceRoleKey: 'srk',
      apiKey: 'ak',
      email: 'u@e.com',
      headers: { host: 'x' },
      body: { a: 1 },
      session: { user: 1 },
      userId: 'user-1',
      code: 'PGRST202',
      nested: { token: 'x', safe: 'ok' },
    }) as Record<string, any>

    for (const k of [
      'authorization', 'cookie', 'set-cookie', 'access_token', 'refresh_token',
      'password', 'secret', 'serviceRoleKey', 'apiKey', 'email', 'headers', 'body', 'session',
    ]) {
      expect(out[k]).toBe(REDACTED)
    }
    expect(out.userId).toBe('user-1')
    expect(out.code).toBe('PGRST202')
    expect(out.nested.token).toBe(REDACTED)
    expect(out.nested.safe).toBe('ok')
  })

  it('redacts broad keys only on exact match, preserving useful identifiers', () => {
    const out = redactDiagnosticValue({
      request: { raw: 'event' },
      response: { raw: 'provider' },
      key: 'secret-value',
      requestId: 'req-123',
      responseStatus: 200,
      storageKey: 'hub/ch/user/file.png',
      stage: 'create_signed_urls',
    }) as Record<string, unknown>

    expect(out.request).toBe(REDACTED)
    expect(out.response).toBe(REDACTED)
    expect(out.key).toBe(REDACTED)
    // Useful, non-sensitive context survives the broad-word redaction.
    expect(out.requestId).toBe('req-123')
    expect(out.responseStatus).toBe(200)
    expect(out.storageKey).toBe('hub/ch/user/file.png')
    expect(out.stage).toBe('create_signed_urls')
  })

  it('preserves UUID-like ids (not treated as long credentials)', () => {
    const out = redactDiagnosticValue({ deletionId: '123e4567-e89b-12d3-a456-426614174000' }) as Record<string, unknown>
    expect(out.deletionId).toBe('123e4567-e89b-12d3-a456-426614174000')
  })

  it('bounds array length', () => {
    const out = redactDiagnosticValue(Array.from({ length: 20 }, (_, i) => i)) as unknown[]
    expect(out.length).toBe(11)
    expect(out[10]).toBe('[+10 more]')
  })

  it('does not crash on circular references', () => {
    const a: Record<string, unknown> = { name: 'root' }
    a.self = a
    expect(() => redactDiagnosticValue(a)).not.toThrow()
    const out = redactDiagnosticValue(a) as Record<string, unknown>
    expect(out.self).toBe('[Circular]')
    expect(out.name).toBe('root')
  })

  it('bounds object depth', () => {
    const deep = { a: { b: { c: { d: { e: 1 } } } } }
    const out = redactDiagnosticValue(deep) as any
    // depth 0=root, 1=a, 2=b -> at depth 3 the object is collapsed
    expect(out.a.b.c).toBe('[Object]')
  })
})

describe('logSafeServerFailure', () => {
  it('emits a redacted, route/stage-tagged payload (secrets dropped, provider code survives)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      logSafeServerFailure(
        'chat/attachments/upload',
        { stage: 'storage_upload', bucket: 'chat-attachments', requestId: 'req-1' },
        { code: 'PGRST301', status: 403, message: 'denied for user@example.com', hint: 'check policy' },
      )

      const call = spy.mock.calls.find(c => c[0] === '[chat/attachments/upload] failed')
      expect(call).toBeDefined()
      const payload = call?.[1] as Record<string, any>

      expect(payload.route).toBe('chat/attachments/upload')
      expect(payload.stage).toBe('storage_upload')
      expect(payload.bucket).toBe('chat-attachments')
      expect(payload.requestId).toBe('req-1')
      expect(payload.error.code).toBe('PGRST301')
      expect(payload.error.status).toBe(403)

      const serialized = JSON.stringify(payload)
      expect(serialized).not.toContain('user@example.com')
    } finally {
      vi.restoreAllMocks()
    }
  })
})
