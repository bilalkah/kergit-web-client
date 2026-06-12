import { describe, expect, it } from 'vitest'
import { getAuthErrorStatus, toAuthErrorMessage } from './authErrors'

describe('auth error status', () => {
  it('extracts an HTTP status without exposing the raw error', () => {
    expect(getAuthErrorStatus({ response: { status: 401 } })).toBe(401)
  })
})

describe('signup auth errors', () => {
  const duplicateUsername = 'Bu kullanıcı adı kullanımda. Lütfen başka bir kullanıcı adı seçin.'

  it('maps the Supabase profile-trigger 500 to a duplicate username message', () => {
    expect(toAuthErrorMessage(
      { status: 500, message: 'Database error saving new user' },
      'signup',
    )).toBe(duplicateUsername)
  })

  it('maps a unique-violation message to a duplicate username message', () => {
    expect(toAuthErrorMessage(
      { message: 'duplicate key value violates unique constraint "idx_profiles_user_name_unique"' },
      'signup',
    )).toBe(duplicateUsername)
  })

  it('maps an already-registered email to an email-specific message', () => {
    expect(toAuthErrorMessage(
      { status: 400, message: 'User already registered' },
      'signup',
    )).toBe('Bu e-posta adresi zaten kayıtlı. Giriş yapmayı dene.')
  })

  it('keeps a generic server error when the reason is unknown', () => {
    expect(toAuthErrorMessage(
      { status: 500, message: 'Internal Server Error' },
      'signup',
    )).toBe('Kayıt sırasında sunucu hatası oluştu. Lütfen tekrar dene.')
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
