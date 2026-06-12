import { $fetch } from 'ofetch'
import type { AuthSession } from '@/stores/auth'
import { getAuthErrorStatus, toAuthErrorMessage } from '@/src/utils/authErrors'
import type { AuthBootstrapResult, FreshSessionResult } from './freshSession'

type AuthSessionResponse = {
  session: AuthSession | null
}

type LoginPayload = {
  email: string
  password: string
}

type TokenExchangePayload = {
  accessToken: string
  refreshToken: string
}

type UpdatePasswordPayload = {
  password: string
}

type DeleteAccountPayload = {
  emailConfirmation: string
}

export class UnauthenticatedSessionError extends Error {
  constructor() {
    super('Authentication required')
    this.name = 'UnauthenticatedSessionError'
  }
}

function requireSession(session: AuthSession | null, fallbackMessage: string): AuthSession {
  if (!session) {
    throw new Error(fallbackMessage)
  }

  return session
}

export async function restoreServerSession(): Promise<AuthSession | null> {
  const response = await bootstrapServerSession()
  return response.status === 'ok' ? response.session : null
}

export async function bootstrapServerSession(): Promise<AuthBootstrapResult> {
  return await $fetch<AuthBootstrapResult>('/api/auth/session', {
    timeout: 5000,
  })
}

export async function refreshServerSession(): Promise<AuthSession | null> {
  const response = await $fetch<AuthSessionResponse>('/api/auth/refresh', {
    method: 'POST',
  })

  return response.session
}

export async function checkFreshSession(): Promise<FreshSessionResult> {
  try {
    return await $fetch<FreshSessionResult>('/api/auth/fresh-session', {
      timeout: 5000,
    })
  } catch (error: unknown) {
    if (getAuthErrorStatus(error) === 401) {
      throw new UnauthenticatedSessionError()
    }
    throw new Error(toAuthErrorMessage(error, 'generic'))
  }
}

export async function loginWithPassword(payload: LoginPayload): Promise<AuthSession> {
  try {
    const response = await $fetch<AuthSessionResponse>('/api/auth/login', {
      method: 'POST',
      body: payload,
    })

    return requireSession(response.session, 'Giriş işlemi geçerli bir oturum döndürmedi')
  } catch (error: unknown) {
    throw new Error(toAuthErrorMessage(error, 'login'))
  }
}

export async function exchangeCallbackSession(payload: TokenExchangePayload): Promise<AuthSession> {
  try {
    const response = await $fetch<AuthSessionResponse>('/api/auth/exchange', {
      method: 'POST',
      body: payload,
    })

    return requireSession(response.session, 'Doğrulama dönüşü geçerli bir oturum döndürmedi')
  } catch (error: unknown) {
    throw new Error(toAuthErrorMessage(error, 'verify-email'))
  }
}

export async function logoutServerSession(): Promise<void> {
  await $fetch('/api/auth/logout', {
    method: 'POST',
  })
}

export async function updateCurrentPassword(payload: UpdatePasswordPayload): Promise<void> {
  try {
    await $fetch('/api/auth/update-password', {
      method: 'POST',
      body: payload,
    })
  } catch (error: unknown) {
    throw new Error(toAuthErrorMessage(error, 'password-update'))
  }
}

export async function deleteCurrentAccount(payload: DeleteAccountPayload): Promise<void> {
  try {
    await $fetch('/api/auth/delete-account', {
      method: 'POST',
      body: payload,
    })
  } catch (error: unknown) {
    throw new Error(toAuthErrorMessage(error, 'account-delete'))
  }
}
