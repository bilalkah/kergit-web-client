import { describe, expect, it } from 'vitest'
import {
  EMAIL_CHANGE_RELOGIN_MESSAGE,
  hasAuthoritativeEmailChanged,
  isEmailChangeSuccessQuery,
} from './freshSession'

describe('fresh session email comparison', () => {
  it('detects an authoritative email change case-insensitively', () => {
    expect(hasAuthoritativeEmailChanged('old@example.com', 'new@example.com')).toBe(true)
    expect(hasAuthoritativeEmailChanged('USER@example.com', 'user@example.com')).toBe(false)
  })

  it('does not declare a mismatch when either email is missing', () => {
    expect(hasAuthoritativeEmailChanged(undefined, 'new@example.com')).toBe(false)
    expect(hasAuthoritativeEmailChanged('old@example.com', undefined)).toBe(false)
  })
})

describe('email-change relogin notice', () => {
  it('recognizes only the success query and exposes the required message', () => {
    expect(isEmailChangeSuccessQuery('success')).toBe(true)
    expect(isEmailChangeSuccessQuery(['success'])).toBe(true)
    expect(isEmailChangeSuccessQuery('failed')).toBe(false)
    expect(EMAIL_CHANGE_RELOGIN_MESSAGE).toBe(
      'E-posta adresin değiştirildi. Lütfen yeni e-posta adresinle tekrar giriş yap.'
    )
  })
})
