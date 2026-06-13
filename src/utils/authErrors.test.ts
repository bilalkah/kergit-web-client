import { describe, expect, it } from 'vitest'
import { getAuthErrorStatus, toAuthErrorMessage } from './authErrors'

describe('auth error status', () => {
  it('extracts an HTTP status without exposing the raw error', () => {
    expect(getAuthErrorStatus({ response: { status: 401 } })).toBe(401)
  })
})

describe('email update auth errors', () => {
  it('maps same-email validation failures', () => {
    expect(toAuthErrorMessage(
      { statusCode: 400, statusMessage: 'New email must be different from current email' },
      'email-update',
    )).toBe('Yeni e-posta mevcut e-posta adresinden farklı olmalı.')
  })

  it('maps invalid email failures', () => {
    expect(toAuthErrorMessage(
      { statusCode: 400, statusMessage: 'Invalid email address' },
      'email-update',
    )).toBe('Geçerli bir e-posta adresi gir.')
  })

  it('maps unauthenticated failures', () => {
    expect(toAuthErrorMessage(
      { statusCode: 401, statusMessage: 'Authentication required' },
      'email-update',
    )).toBe('E-posta adresini güncellemek için tekrar giriş yapman gerekiyor.')
  })
})

describe('email-change callback auth errors', () => {
  it('maps expired callback failures to email-change-specific Turkish copy', () => {
    expect(toAuthErrorMessage(
      { statusCode: 401, statusMessage: 'Token has expired' },
      'email-change-callback',
    )).toBe('E-posta değişikliği doğrulama bağlantısı geçersiz, süresi dolmuş veya daha önce kullanılmış.')
  })

  it('maps callback server failures without exposing technical details', () => {
    expect(toAuthErrorMessage(
      { statusCode: 500, statusMessage: 'Internal Server Error' },
      'email-change-callback',
    )).toBe('E-posta değişikliği doğrulanırken sunucu hatası oluştu. Lütfen tekrar dene.')
  })
})
