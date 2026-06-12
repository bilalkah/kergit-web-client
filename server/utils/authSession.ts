import { type Session, type SupabaseClient } from '@supabase/supabase-js'
import {
  createError,
  deleteCookie,
  getCookie,
  getHeader,
  setCookie,
  setResponseHeader,
  type H3Event,
} from 'h3'
import { mapSupabaseSession } from '@/src/services/auth/supabaseAdapter'
import type { AuthSession } from '@/stores/auth'
import { createServerSupabaseClient } from './supabaseServerClient'

const ACCESS_TOKEN_COOKIE = 'kergit_at'
const REFRESH_TOKEN_COOKIE = 'kergit_rt'
const REFRESH_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

function createServerSupabaseAuthClient(): SupabaseClient {
  const config = useRuntimeConfig()

  if (!config.public.supabaseUrl || !config.public.supabaseAnonKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Supabase runtime configuration is missing',
    })
  }

  return createServerSupabaseClient(config.public.supabaseUrl, config.public.supabaseAnonKey)
}

function shouldUseSecureCookies(event: H3Event): boolean {
  const forwardedProto = getHeader(event, 'x-forwarded-proto')
  if (forwardedProto) {
    return forwardedProto.split(',')[0]?.trim() === 'https'
  }

  return process.env.NODE_ENV === 'production'
}

function getCookieBaseOptions(event: H3Event) {
  return {
    httpOnly: true,
    path: '/',
    sameSite: 'lax' as const,
    secure: shouldUseSecureCookies(event),
  }
}

function getAccessTokenMaxAgeSeconds(session: Session): number {
  if (!session.expires_at) return 0
  return Math.max(Math.floor(session.expires_at - Date.now() / 1000), 0)
}

export function markAuthResponseNoStore(event: H3Event) {
  setResponseHeader(event, 'Cache-Control', 'no-store')
}

export function writeAuthSessionCookies(event: H3Event, session: Session) {
  const cookieOptions = getCookieBaseOptions(event)

  setCookie(event, ACCESS_TOKEN_COOKIE, session.access_token, {
    ...cookieOptions,
    maxAge: getAccessTokenMaxAgeSeconds(session),
  })

  setCookie(event, REFRESH_TOKEN_COOKIE, session.refresh_token, {
    ...cookieOptions,
    maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
  })
}

export function clearAuthSessionCookies(event: H3Event) {
  const cookieOptions = getCookieBaseOptions(event)

  deleteCookie(event, ACCESS_TOKEN_COOKIE, cookieOptions)
  deleteCookie(event, REFRESH_TOKEN_COOKIE, cookieOptions)
}

function toAuthSessionOrThrow(session: Session | null): AuthSession {
  const authSession = mapSupabaseSession(session)
  if (!authSession) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Supabase returned an invalid session payload',
    })
  }

  return authSession
}

export async function restoreSupabaseSessionFromCookies(event: H3Event): Promise<Session | null> {
  markAuthResponseNoStore(event)

  const refreshToken = getCookie(event, REFRESH_TOKEN_COOKIE)
  if (!refreshToken) {
    clearAuthSessionCookies(event)
    return null
  }

  const accessToken = getCookie(event, ACCESS_TOKEN_COOKIE)
  const supabase = createServerSupabaseAuthClient()

  let response = accessToken
    ? await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
    : await supabase.auth.refreshSession({
        refresh_token: refreshToken,
      })

  if ((response.error || !response.data.session) && accessToken) {
    response = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    })
  }

  if (response.error || !response.data.session) {
    clearAuthSessionCookies(event)
    return null
  }

  writeAuthSessionCookies(event, response.data.session)
  return response.data.session
}

export async function forceRefreshSupabaseSessionFromCookies(
  event: H3Event
): Promise<Session | null> {
  markAuthResponseNoStore(event)

  const refreshToken = getCookie(event, REFRESH_TOKEN_COOKIE)
  if (!refreshToken) {
    clearAuthSessionCookies(event)
    return null
  }

  const supabase = createServerSupabaseAuthClient()
  const response = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  })

  if (response.error || !response.data.session) {
    clearAuthSessionCookies(event)
    return null
  }

  writeAuthSessionCookies(event, response.data.session)
  return response.data.session
}

export async function exchangeSupabaseSession(
  event: H3Event,
  accessToken: string,
  refreshToken: string
): Promise<AuthSession> {
  markAuthResponseNoStore(event)

  const supabase = createServerSupabaseAuthClient()
  const response = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  if (response.error || !response.data.session) {
    clearAuthSessionCookies(event)
    throw createError({
      statusCode: 401,
      statusMessage: response.error?.message ?? 'Invalid or expired auth callback session',
    })
  }

  writeAuthSessionCookies(event, response.data.session)
  return toAuthSessionOrThrow(response.data.session)
}

export async function loginSupabaseSession(
  event: H3Event,
  email: string,
  password: string
): Promise<AuthSession> {
  markAuthResponseNoStore(event)

  const supabase = createServerSupabaseAuthClient()
  const response = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (response.error || !response.data.session) {
    clearAuthSessionCookies(event)
    throw createError({
      statusCode: 401,
      statusMessage: response.error?.message ?? 'Invalid email or password',
    })
  }

  writeAuthSessionCookies(event, response.data.session)
  return toAuthSessionOrThrow(response.data.session)
}

export async function logoutSupabaseSession(event: H3Event): Promise<void> {
  markAuthResponseNoStore(event)

  const session = await restoreSupabaseSessionFromCookies(event)
  if (!session) {
    clearAuthSessionCookies(event)
    return
  }

  const supabase = createServerSupabaseAuthClient()
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })

  if (!sessionError) {
    await supabase.auth.signOut({ scope: 'local' })
  }

  clearAuthSessionCookies(event)
}

export async function requireSupabaseSessionFromCookies(event: H3Event): Promise<Session> {
  const session = await restoreSupabaseSessionFromCookies(event)
  if (!session) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required',
    })
  }

  return session
}

export function toAuthSessionResponse(session: Session | null) {
  return {
    session: session ? toAuthSessionOrThrow(session) : null,
  }
}

export async function updateSupabasePassword(
  event: H3Event,
  password: string
): Promise<void> {
  markAuthResponseNoStore(event)

  const session = await requireSupabaseSessionFromCookies(event)
  const supabase = createServerSupabaseAuthClient()
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })

  if (sessionError) {
    clearAuthSessionCookies(event)
    throw createError({
      statusCode: 401,
      statusMessage: sessionError.message,
    })
  }

  const { error } = await supabase.auth.updateUser({
    password,
  })

  if (error) {
    throw createError({
      statusCode: error.status ?? 400,
      statusMessage: error.message,
    })
  }

  const refreshedSession = await supabase.auth.getSession()
  if (refreshedSession.data.session) {
    writeAuthSessionCookies(event, refreshedSession.data.session)
  }
}
