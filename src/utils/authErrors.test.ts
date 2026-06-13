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

describe('account deletion auth errors', () => {
  it('maps unauthenticated failures', () => {
    expect(toAuthErrorMessage(
      { statusCode: 401, statusMessage: 'Authentication required' },
      'account-delete',
    )).toBe('Oturumun süresi dolmuş. Lütfen tekrar giriş yap.')
  })

  it('maps email mismatch failures', () => {
    expect(toAuthErrorMessage(
      { statusCode: 403, statusMessage: 'Email confirmation mismatch' },
      'account-delete',
    )).toBe('E-posta adresi mevcut hesabınla eşleşmiyor.')
  })

  it('maps storage cleanup conflicts', () => {
    expect(toAuthErrorMessage(
      { statusCode: 409, statusMessage: 'Account storage cleanup required' },
      'account-delete',
    )).toBe('Hesap silinemedi çünkü hesaba bağlı dosyalar temizlenemedi.')
  })

  it('maps rate-limited failures', () => {
    expect(toAuthErrorMessage(
      { statusCode: 429, statusMessage: 'Account deletion rate limited' },
      'account-delete',
    )).toBe('Hesap silinemedi. Lütfen daha sonra tekrar dene.')
  })

  it('maps server failures', () => {
    expect(toAuthErrorMessage(
      { statusCode: 500, statusMessage: 'Account deletion failed' },
      'account-delete',
    )).toBe('Hesap silinemedi. Lütfen daha sonra tekrar dene.')
  })

  it('does not expose an unexpected raw server message', () => {
    expect(toAuthErrorMessage(
      { statusCode: 400, statusMessage: 'Internal secret details' },
      'account-delete',
    )).toBe('Hesap silinemedi. Lütfen tekrar dene.')
  })
})
