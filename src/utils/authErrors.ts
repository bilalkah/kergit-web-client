type AuthErrorContext =
  | 'login'
  | 'signup'
  | 'forgot-password'
  | 'verify-email'
  | 'email-change-callback'
  | 'password-update'
  | 'email-update'
  | 'account-delete'
  | 'generic'

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  if (value === null || typeof value !== 'object') return null
  return value as UnknownRecord
}

function toStringValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toNumberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function normalize(text: string): string {
  return text.trim().toLowerCase()
}

function containsAny(text: string, tokens: string[]): boolean {
  return tokens.some((token) => text.includes(token))
}

function isOpaqueTransportMessage(text: string): boolean {
  const normalized = normalize(text)
  if (normalized.startsWith('[get]') || normalized.startsWith('[post]')) return true
  if (normalized.includes('/api/auth/')) return true
  if (normalized.includes('ofetch')) return true
  return false
}

function isGenericTechnicalMessage(normalizedMessage: string): boolean {
  return containsAny(normalizedMessage, [
    'unauthorized',
    'forbidden',
    'bad request',
    'internal server error',
    'request failed',
    'unknown error',
    'an error occurred',
  ])
}

function parseAuthError(error: unknown) {
  const root = asRecord(error)
  const data = asRecord(root?.data)
  const bodyData = asRecord(data?.data)
  const response = asRecord(root?.response)
  const responseData = asRecord(response?.data)

  const status =
    toNumberValue(root?.statusCode) ??
    toNumberValue(root?.status) ??
    toNumberValue(data?.statusCode) ??
    toNumberValue(data?.status) ??
    toNumberValue(response?.status) ??
    null

  const code =
    toStringValue(root?.code) ??
    toStringValue(data?.code) ??
    toStringValue(bodyData?.code) ??
    toStringValue(responseData?.code) ??
    null

  const messageCandidates = [
    toStringValue(data?.statusMessage),
    toStringValue(data?.message),
    toStringValue(bodyData?.statusMessage),
    toStringValue(bodyData?.message),
    toStringValue(responseData?.statusMessage),
    toStringValue(responseData?.message),
    toStringValue(root?.statusMessage),
    toStringValue(root?.message),
  ]

  const message = messageCandidates.find((value) => value !== null) ?? null
  const normalizedMessage = message ? normalize(message) : ''

  return {
    status,
    code: code ? normalize(code) : null,
    message,
    normalizedMessage,
  }
}

export function getAuthErrorStatus(error: unknown): number | null {
  return parseAuthError(error).status
}

function isNetworkLikeError(normalizedMessage: string): boolean {
  return containsAny(normalizedMessage, [
    'failed to fetch',
    'fetch failed',
    'networkerror',
    'network request failed',
    'load failed',
    'network error',
    'connection refused',
    'econnrefused',
  ])
}

function isRateLimited(
  status: number | null,
  code: string | null,
  normalizedMessage: string
): boolean {
  if (status === 429) return true
  if (code && containsAny(code, ['rate_limit', 'too_many_requests', 'too_many_attempts'])) return true
  if (containsAny(normalizedMessage, ['rate limit', 'too many requests', 'too many attempts'])) return true
  return false
}

function mapLoginMessage(
  status: number | null,
  code: string | null,
  normalizedMessage: string
): string | null {
  if (containsAny(normalizedMessage, ['email not confirmed', 'not_confirmed'])) {
    return 'E-posta adresin henüz doğrulanmamış. E-postandaki doğrulama bağlantısını açıp tekrar dene.'
  }

  if (status === 401 || containsAny(normalizedMessage, [
    'invalid login credentials',
    'invalid credentials',
    'invalid email or password',
    'wrong password',
  ])) {
    return 'E-posta veya şifre hatalı.'
  }

  if (isRateLimited(status, code, normalizedMessage)) {
    return 'Çok fazla giriş denemesi yaptın. Lütfen birkaç dakika sonra tekrar dene.'
  }

  if (isNetworkLikeError(normalizedMessage)) {
    return 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.'
  }

  if (status !== null && status >= 500) {
    return 'Giriş sırasında sunucu hatası oluştu. Lütfen tekrar dene.'
  }

  return null
}

function mapSignupMessage(
  status: number | null,
  code: string | null,
  normalizedMessage: string
): string | null {
  if (containsAny(normalizedMessage, [
    'user already registered',
    'already registered',
    'already exists',
    'duplicate key value',
    'unique constraint',
  ])) {
    return 'Bu e-posta veya kullanıcı adı zaten kullanımda.'
  }

  if (containsAny(normalizedMessage, ['invalid email', 'email address is invalid'])) {
    return 'Geçerli bir e-posta adresi gir.'
  }

  if (containsAny(normalizedMessage, ['password should be at least', 'weak password', 'password is too weak'])) {
    return 'Şifren yeterince güçlü değil. Daha güçlü bir şifre belirleyip tekrar dene.'
  }

  if (containsAny(normalizedMessage, ['signup is disabled', 'signups not allowed'])) {
    return 'Kayıt işlemi şu anda kapalı.'
  }

  if (isRateLimited(status, code, normalizedMessage)) {
    return 'Çok fazla kayıt denemesi yaptın. Lütfen birkaç dakika sonra tekrar dene.'
  }

  if (isNetworkLikeError(normalizedMessage)) {
    return 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.'
  }

  if (status !== null && status >= 500) {
    return 'Kayıt sırasında sunucu hatası oluştu. Lütfen tekrar dene.'
  }

  return null
}

function mapForgotPasswordMessage(
  status: number | null,
  code: string | null,
  normalizedMessage: string
): string | null {
  if (containsAny(normalizedMessage, ['invalid email', 'email address is invalid'])) {
    return 'Geçerli bir e-posta adresi gir.'
  }

  if (isRateLimited(status, code, normalizedMessage)) {
    return 'Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar dene.'
  }

  if (isNetworkLikeError(normalizedMessage)) {
    return 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.'
  }

  return null
}

function mapVerifyEmailMessage(status: number | null, normalizedMessage: string): string | null {
  if (containsAny(normalizedMessage, [
    'invalid token',
    'token has expired',
    'expired',
    'otp_expired',
    'refresh token',
    'invalid grant',
    'session not found',
  ])) {
    return 'Doğrulama bağlantısı geçersiz veya süresi dolmuş. Yeni bir doğrulama e-postası iste.'
  }

  if (isNetworkLikeError(normalizedMessage)) {
    return 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.'
  }

  if (status !== null && status >= 500) {
    return 'Doğrulama sırasında sunucu hatası oluştu. Lütfen tekrar dene.'
  }

  return null
}

function mapEmailChangeCallbackMessage(
  status: number | null,
  normalizedMessage: string
): string | null {
  if (containsAny(normalizedMessage, [
    'invalid email change auth callback',
    'invalid token',
    'token has expired',
    'expired',
    'otp_expired',
    'refresh token',
    'invalid grant',
    'session not found',
  ])) {
    return 'E-posta değişikliği doğrulama bağlantısı geçersiz, süresi dolmuş veya daha önce kullanılmış.'
  }

  if (isNetworkLikeError(normalizedMessage)) {
    return 'E-posta değişikliği doğrulanırken sunucuya ulaşılamadı. Lütfen tekrar dene.'
  }

  if (status !== null && status >= 500) {
    return 'E-posta değişikliği doğrulanırken sunucu hatası oluştu. Lütfen tekrar dene.'
  }

  return null
}

function mapPasswordUpdateMessage(status: number | null, normalizedMessage: string): string | null {
  if (containsAny(normalizedMessage, ['new password should be different', 'same as the old password'])) {
    return 'Yeni şifren eski şifrenle aynı olamaz.'
  }

  if (containsAny(normalizedMessage, ['password should be at least', 'weak password', 'password is too weak'])) {
    return 'Yeni şifre yeterince güçlü değil.'
  }

  if (status === 401 || containsAny(normalizedMessage, ['authentication required', 'unauthorized'])) {
    return 'Şifre güncellemek için tekrar giriş yapman gerekiyor.'
  }

  if (isNetworkLikeError(normalizedMessage)) {
    return 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.'
  }

  return null
}

function mapEmailUpdateMessage(
  status: number | null,
  code: string | null,
  normalizedMessage: string
): string | null {
  if (containsAny(normalizedMessage, ['new email must be different', 'same email'])) {
    return 'Yeni e-posta mevcut e-posta adresinden farklı olmalı.'
  }

  if (containsAny(normalizedMessage, ['invalid email', 'email address is invalid'])) {
    return 'Geçerli bir e-posta adresi gir.'
  }

  if (containsAny(normalizedMessage, ['already registered', 'already exists', 'email exists'])) {
    return 'Bu e-posta adresi başka bir hesap tarafından kullanılıyor.'
  }

  if (status === 401 || containsAny(normalizedMessage, ['authentication required', 'unauthorized'])) {
    return 'E-posta adresini güncellemek için tekrar giriş yapman gerekiyor.'
  }

  if (isRateLimited(status, code, normalizedMessage)) {
    return 'Çok fazla e-posta değiştirme denemesi yaptın. Lütfen birkaç dakika sonra tekrar dene.'
  }

  if (isNetworkLikeError(normalizedMessage)) {
    return 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.'
  }

  if (status !== null && status >= 500) {
    return 'E-posta güncellenirken sunucu hatası oluştu. Lütfen tekrar dene.'
  }

  return null
}

function mapAccountDeleteMessage(
  status: number | null,
  code: string | null,
  normalizedMessage: string
): string | null {
  if (status === 401 || containsAny(normalizedMessage, ['authentication required', 'unauthorized'])) {
    return 'Oturumun süresi dolmuş. Lütfen tekrar giriş yap.'
  }

  if (containsAny(normalizedMessage, ['session email is unavailable'])) {
    return 'Mevcut e-posta doğrulanamadı. Lütfen tekrar giriş yap.'
  }

  if (containsAny(normalizedMessage, ['invalid email confirmation'])) {
    return 'Geçerli bir e-posta adresi yaz.'
  }

  if (status === 403 || containsAny(normalizedMessage, [
    'email confirmation mismatch',
    'email mismatch',
    'does not match',
  ])) {
    return 'E-posta adresi mevcut hesabınla eşleşmiyor.'
  }

  if (containsAny(normalizedMessage, [
    'storage cleanup',
    'storage ownership',
    'storage object',
    'bucket',
  ])) {
    return 'Hesap silinemedi çünkü hesaba bağlı dosyalar temizlenemedi.'
  }

  if (isRateLimited(status, code, normalizedMessage)) {
    return 'Hesap silinemedi. Lütfen daha sonra tekrar dene.'
  }

  if (status !== null && status >= 500) {
    return 'Hesap silinemedi. Lütfen daha sonra tekrar dene.'
  }

  if (isNetworkLikeError(normalizedMessage)) {
    return 'Hesap silinemedi. Lütfen tekrar dene.'
  }

  return null
}

export function toAuthErrorMessage(error: unknown, context: AuthErrorContext): string {
  const { status, code, message, normalizedMessage } = parseAuthError(error)
  const mapped = (
    context === 'login'
      ? mapLoginMessage(status, code, normalizedMessage)
      : context === 'signup'
      ? mapSignupMessage(status, code, normalizedMessage)
      : context === 'forgot-password'
      ? mapForgotPasswordMessage(status, code, normalizedMessage)
      : context === 'verify-email'
      ? mapVerifyEmailMessage(status, normalizedMessage)
      : context === 'email-change-callback'
      ? mapEmailChangeCallbackMessage(status, normalizedMessage)
      : context === 'password-update'
      ? mapPasswordUpdateMessage(status, normalizedMessage)
      : context === 'email-update'
      ? mapEmailUpdateMessage(status, code, normalizedMessage)
      : context === 'account-delete'
      ? mapAccountDeleteMessage(status, code, normalizedMessage)
      : null
  )

  if (mapped) return mapped

  if (context === 'account-delete') {
    return 'Hesap silinemedi. Lütfen tekrar dene.'
  }

  if (message && !isOpaqueTransportMessage(message) && !isGenericTechnicalMessage(normalizedMessage)) {
    return message
  }

  if (context === 'login') return 'Giriş işlemi tamamlanamadı. Lütfen tekrar dene.'
  if (context === 'signup') return 'Kayıt işlemi tamamlanamadı. Bilgilerini kontrol edip tekrar dene.'
  if (context === 'forgot-password') return 'Sıfırlama e-postası gönderilemedi. Lütfen tekrar dene.'
  if (context === 'verify-email') return 'E-posta doğrulaması tamamlanamadı. Lütfen tekrar dene.'
  if (context === 'email-change-callback') return 'E-posta değişikliği doğrulanamadı. Lütfen tekrar dene.'
  if (context === 'password-update') return 'Şifre güncellenemedi. Lütfen tekrar dene.'
  if (context === 'email-update') return 'E-posta güncelleme isteği tamamlanamadı. Lütfen tekrar dene.'
  return 'İşlem tamamlanamadı. Lütfen tekrar dene.'
}
