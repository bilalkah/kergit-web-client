import { beforeEach, describe, expect, it } from 'vitest'
import {
  AUTH_REDIRECT_STATE_PARAM,
  consumePendingAuthRedirectState,
  issueAuthRedirectUrl,
} from './authRedirectState'

describe('auth redirect state', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('consumes a matching state once', () => {
    const redirectUrl = new URL(issueAuthRedirectUrl('/login', 'signup-verification'))
    const state = redirectUrl.searchParams.get(AUTH_REDIRECT_STATE_PARAM)

    expect(consumePendingAuthRedirectState('signup-verification', state)).toEqual({ ok: true })
    expect(consumePendingAuthRedirectState('signup-verification', state)).toEqual({
      ok: false,
      reason: 'missing_pending_state',
    })
  })

  it('rejects a mismatched state', () => {
    issueAuthRedirectUrl('/reset-password', 'password-recovery')

    expect(consumePendingAuthRedirectState('password-recovery', 'different-state')).toEqual({
      ok: false,
      reason: 'mismatched_state',
    })
  })
})
