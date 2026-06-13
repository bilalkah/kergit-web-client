import type { AuthSession } from '@/stores/auth'

export const EMAIL_CHANGE_RELOGIN_MESSAGE =
  'E-posta adresin değiştirildi. Lütfen yeni e-posta adresinle tekrar giriş yap.'

export type FreshSessionResult =
  | {
      status: 'ok'
      session: AuthSession
    }
  | {
      status: 'stale_session'
      reason: 'email_changed'
      action: 'force_relogin'
    }

export type AuthBootstrapResult =
  | FreshSessionResult
  | {
      status: 'unauthenticated'
      session: null
    }

export function hasAuthoritativeEmailChanged(
  localEmail: string | null | undefined,
  freshEmail: string | null | undefined,
): boolean {
  const normalizedLocalEmail = localEmail?.trim().toLowerCase()
  const normalizedFreshEmail = freshEmail?.trim().toLowerCase()

  return Boolean(
    normalizedLocalEmail &&
    normalizedFreshEmail &&
    normalizedLocalEmail !== normalizedFreshEmail
  )
}

export function isEmailChangeSuccessQuery(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length === 1 && value[0] === 'success'
  }

  return value === 'success'
}
