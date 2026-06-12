import { $fetch } from 'ofetch'
import type { AuthSession } from '@/stores/auth'
import { toAuthErrorMessage } from '@/src/utils/authErrors'

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

function requireSession(session: AuthSession | null, fallbackMessage: string): AuthSession {
  if (!session) {
    throw new Error(fallbackMessage)
  }

  return session
}

export async function restoreServerSession(): Promise<AuthSession | null> {
  const response = await $fetch<AuthSessionResponse>('/api/auth/session', {
    timeout: 5000,
  })
  return response.session
}

export async function refreshServerSession(): Promise<AuthSession | null> {
  const response = await $fetch<AuthSessionResponse>('/api/auth/refresh', {
    method: 'POST',
  })

  return response.session
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
