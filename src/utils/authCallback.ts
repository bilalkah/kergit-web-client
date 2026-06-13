export type QueryParamValue = string | null | undefined | Array<string | null>

export const EMAIL_CHANGE_CONFIRMATION_ACCEPTED_MESSAGE =
  'Confirmation link accepted. Please proceed to confirm link sent to the other email'

export type EmailChangeAuthCallbackPayload = {
  access_token: string
  refresh_token: string
  type: 'email_change'
}

export type EmailChangeAuthCallbackParseResult =
  | { ok: true; kind: 'confirmation-accepted' }
  | { ok: true; kind: 'session'; payload: EmailChangeAuthCallbackPayload }
  | { ok: false; message: string }

export function getSingleQueryParam(value: QueryParamValue): string | null {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : null
  }
  return typeof value === 'string' ? value : null
}

function getTrimmedParam(params: URLSearchParams, name: string): string | null {
  const value = params.get(name)?.trim()
  return value || null
}

export function isEmailChangeAuthCallbackUrl(url: URL): boolean {
  const hash = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash)

  const hasHashTokenCallback =
    Boolean(getTrimmedParam(hash, 'access_token')) &&
    Boolean(getTrimmedParam(hash, 'refresh_token')) &&
    getTrimmedParam(hash, 'type') === 'email_change'
  const hasConfirmationAcceptedMessage =
    getTrimmedParam(hash, 'message') === EMAIL_CHANGE_CONFIRMATION_ACCEPTED_MESSAGE
  const hasEmailChangeError =
    Boolean(getTrimmedParam(hash, 'error')) &&
    getTrimmedParam(url.searchParams, 'auth_flow') === 'email-change'

  return hasHashTokenCallback || hasConfirmationAcceptedMessage || hasEmailChangeError
}

export function parseEmailChangeAuthCallback(url: URL): EmailChangeAuthCallbackParseResult {
  const hash = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash)

  const callbackError = getTrimmedParam(hash, 'error')
  if (callbackError) {
    return {
      ok: false,
      message: 'Supabase doğrulama bağlantısını reddetti veya bağlantının süresi doldu.',
    }
  }

  const accessToken = getTrimmedParam(hash, 'access_token')
  const refreshToken = getTrimmedParam(hash, 'refresh_token')
  const hashType = getTrimmedParam(hash, 'type')
  const confirmationMessage = getTrimmedParam(hash, 'message')

  const hasConfirmationAcceptedMessage =
    confirmationMessage === EMAIL_CHANGE_CONFIRMATION_ACCEPTED_MESSAGE
  const hasTokens = Boolean(accessToken && refreshToken && hashType === 'email_change')
  const callbackShapeCount = [hasConfirmationAcceptedMessage, hasTokens].filter(Boolean).length

  if (callbackShapeCount !== 1) {
    return {
      ok: false,
      message: 'Doğrulama bağlantısı eksik veya geçersiz.',
    }
  }

  if (hasConfirmationAcceptedMessage) {
    return {
      ok: true,
      kind: 'confirmation-accepted',
    }
  }

  if (accessToken && refreshToken) {
    return {
      ok: true,
      kind: 'session',
      payload: {
        access_token: accessToken,
        refresh_token: refreshToken,
        type: 'email_change',
      },
    }
  }

  return {
    ok: false,
    message: 'Doğrulama bağlantısı eksik veya geçersiz.',
  }
}

export function normalizeEmailChangeAuthCallbackPayload(
  value: unknown
): EmailChangeAuthCallbackPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const payload = value as Record<string, unknown>
  const accessToken = typeof payload.access_token === 'string' ? payload.access_token.trim() : ''
  const refreshToken = typeof payload.refresh_token === 'string' ? payload.refresh_token.trim() : ''

  return accessToken && refreshToken && payload.type === 'email_change'
    ? { access_token: accessToken, refresh_token: refreshToken, type: 'email_change' }
    : null
}

export function clearAuthCallbackUrl() {
  if (typeof window === 'undefined') return
  window.history.replaceState(null, '', window.location.pathname)
}
