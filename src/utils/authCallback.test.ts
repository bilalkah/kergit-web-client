import { describe, expect, it } from 'vitest'
import {
  EMAIL_CHANGE_CONFIRMATION_ACCEPTED_MESSAGE,
  isEmailChangeAuthCallbackUrl,
  normalizeEmailChangeAuthCallbackPayload,
  parseEmailChangeAuthCallback,
} from './authCallback'

const acceptedMessage = encodeURIComponent(EMAIL_CHANGE_CONFIRMATION_ACCEPTED_MESSAGE)

describe('parseEmailChangeAuthCallback', () => {
  it('parses Supabase secure-email-change first-confirmation message', () => {
    expect(parseEmailChangeAuthCallback(
      new URL(`https://app.example/auth/callback?auth_flow=email-change#message=${acceptedMessage}&sb=`),
    )).toEqual({
      ok: true,
      kind: 'confirmation-accepted',
    })
  })

  it('parses Supabase implicit final-confirmation session hash', () => {
    expect(parseEmailChangeAuthCallback(
      new URL('https://app.example/auth/callback?auth_flow=email-change#access_token=access&expires_at=1&expires_in=3600&refresh_token=refresh&sb=&token_type=bearer&type=email_change'),
    )).toEqual({
      ok: true,
      kind: 'session',
      payload: {
        access_token: 'access',
        refresh_token: 'refresh',
        type: 'email_change',
      },
    })
  })

  it('rejects removed and incomplete callback shapes', () => {
    expect(parseEmailChangeAuthCallback(
      new URL('https://app.example/auth/callback?auth_flow=email-change&code=code-value'),
    ).ok).toBe(false)
    expect(parseEmailChangeAuthCallback(
      new URL('https://app.example/auth/callback?token_hash=hash-value&type=email_change'),
    ).ok).toBe(false)
    expect(parseEmailChangeAuthCallback(
      new URL('https://app.example/auth/callback#access_token=access&type=email_change'),
    ).ok).toBe(false)
  })

  it('rejects ambiguous callback payloads', () => {
    expect(parseEmailChangeAuthCallback(
      new URL(`https://app.example/auth/callback#message=${acceptedMessage}&access_token=access&refresh_token=refresh&type=email_change`),
    ).ok).toBe(false)
  })

  it('maps Supabase callback errors to a safe message', () => {
    expect(parseEmailChangeAuthCallback(
      new URL('https://app.example/auth/callback?auth_flow=email-change#error=access_denied&sb='),
    )).toEqual({
      ok: false,
      message: 'Supabase doğrulama bağlantısını reddetti veya bağlantının süresi doldu.',
    })
  })
})

describe('isEmailChangeAuthCallbackUrl', () => {
  it('detects the real message and final-session hashes on a legacy login redirect', () => {
    expect(isEmailChangeAuthCallbackUrl(
      new URL(`https://app.example/login#message=${acceptedMessage}&sb=`),
    )).toBe(true)
    expect(isEmailChangeAuthCallbackUrl(
      new URL('https://app.example/login#access_token=access&refresh_token=refresh&type=email_change'),
    )).toBe(true)
  })

  it('detects an email-change error only when the trusted flow marker is present', () => {
    expect(isEmailChangeAuthCallbackUrl(
      new URL('https://app.example/login?auth_flow=email-change#error=access_denied&sb='),
    )).toBe(true)
    expect(isEmailChangeAuthCallbackUrl(
      new URL('https://app.example/login#error=access_denied'),
    )).toBe(false)
  })

  it('does not detect removed callback branches', () => {
    expect(isEmailChangeAuthCallbackUrl(
      new URL('https://app.example/login?auth_flow=email-change&code=code-value'),
    )).toBe(false)
    expect(isEmailChangeAuthCallbackUrl(
      new URL('https://app.example/login?token_hash=hash-value&type=email_change'),
    )).toBe(false)
  })
})

describe('normalizeEmailChangeAuthCallbackPayload', () => {
  it('normalizes the final implicit session payload posted to the server', () => {
    expect(normalizeEmailChangeAuthCallbackPayload({
      access_token: ' access ',
      refresh_token: ' refresh ',
      type: 'email_change',
    })).toEqual({
      access_token: 'access',
      refresh_token: 'refresh',
      type: 'email_change',
    })
  })

  it('rejects removed or incomplete server callback payloads', () => {
    expect(normalizeEmailChangeAuthCallbackPayload({
      kind: 'code',
      code: 'code-value',
    })).toBeNull()
    expect(normalizeEmailChangeAuthCallbackPayload({
      kind: 'token_hash',
      token_hash: 'hash-value',
      type: 'email_change',
    })).toBeNull()
    expect(normalizeEmailChangeAuthCallbackPayload({
      access_token: 'access',
    })).toBeNull()
    expect(normalizeEmailChangeAuthCallbackPayload({
      access_token: 'access',
      refresh_token: 'refresh',
    })).toBeNull()
  })
})
