import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Spy on the cookie writers; keep every other h3 export real so the module
// under test loads normally.
vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('h3')>()
  return {
    ...actual,
    setCookie: vi.fn(),
    deleteCookie: vi.fn(),
    getHeader: vi.fn(() => undefined),
    setResponseHeader: vi.fn(),
  }
})

import { deleteCookie, setCookie, type H3Event } from 'h3'
import { clearAuthSessionCookies, writeAuthSessionCookies } from './authSession'

const ACCESS_TOKEN_COOKIE = 'kergit_at'
const REFRESH_TOKEN_COOKIE = 'kergit_rt'

// The remember-session window: how long an inactive user stays remembered.
// This is a fixed-length window applied at write time, not a deadline derived
// from the original login timestamp.
const REMEMBER_WINDOW_SECONDS = 60 * 60 * 24 * 30

const event = {} as H3Event

function fakeSession(overrides: Partial<Session> = {}): Session {
  return {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: 'bearer',
    // user shape is irrelevant to cookie writing
    user: { id: 'user-id' } as Session['user'],
    ...overrides,
  } as Session
}

function lastCookieOptions(name: string) {
  const calls = vi.mocked(setCookie).mock.calls.filter((call) => call[1] === name)
  const lastCall = calls.at(-1)
  return lastCall?.[3]
}

describe('auth session cookies (sliding remember window)', () => {
  beforeEach(() => {
    vi.mocked(setCookie).mockClear()
    vi.mocked(deleteCookie).mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes the remember (refresh) cookie with the full sliding window on login', () => {
    writeAuthSessionCookies(event, fakeSession())

    expect(lastCookieOptions(REFRESH_TOKEN_COOKIE)?.maxAge).toBe(REMEMBER_WINDOW_SECONDS)
    expect(lastCookieOptions(REFRESH_TOKEN_COOKIE)?.httpOnly).toBe(true)
  })

  it('derives the access-token cookie from JWT expiry, independent of the remember window', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const nowSeconds = Math.floor(Date.now() / 1000)

    writeAuthSessionCookies(event, fakeSession({ expires_at: nowSeconds + 3600 }))

    // Access cookie tracks the short-lived JWT; refresh cookie tracks the long
    // remember window. They are distinct lifetimes.
    expect(lastCookieOptions(ACCESS_TOKEN_COOKIE)?.maxAge).toBe(3600)
    expect(lastCookieOptions(REFRESH_TOKEN_COOKIE)?.maxAge).toBe(REMEMBER_WINDOW_SECONDS)
  })

  it('extends the remember window from the latest write, not from the first login', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))

    // First login at T0.
    writeAuthSessionCookies(event, fakeSession())
    const firstWindow = lastCookieOptions(REFRESH_TOKEN_COOKIE)?.maxAge
    expect(firstWindow).toBe(REMEMBER_WINDOW_SECONDS)

    // A successful restore/refresh 20 hours later (still the same refresh token)
    // must reset the window to its full length measured from *now*, so the
    // effective deadline moves forward instead of counting down from login.
    vi.advanceTimersByTime(20 * 60 * 60 * 1000)
    writeAuthSessionCookies(event, fakeSession())

    expect(lastCookieOptions(REFRESH_TOKEN_COOKIE)?.maxAge).toBe(REMEMBER_WINDOW_SECONDS)
  })

  it('does not derive the remember window from the login/JWT timestamp', () => {
    // A nearly-expired access token must not shrink the remember window: an
    // actively refreshing user keeps a full window every time.
    writeAuthSessionCookies(event, fakeSession({ expires_at: Math.floor(Date.now() / 1000) + 1 }))

    expect(lastCookieOptions(REFRESH_TOKEN_COOKIE)?.maxAge).toBe(REMEMBER_WINDOW_SECONDS)
  })

  it('clears both auth cookies on logout', () => {
    clearAuthSessionCookies(event)

    const cleared = vi.mocked(deleteCookie).mock.calls.map((call) => call[1])
    expect(cleared).toContain(ACCESS_TOKEN_COOKIE)
    expect(cleared).toContain(REFRESH_TOKEN_COOKIE)
  })
})
