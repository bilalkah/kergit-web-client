import { createError, defineEventHandler, readBody } from 'h3'
import { clearAuthSessionCookies, requireSupabaseSessionFromCookies } from '../../utils/authSession'
import { getSupabaseAdminClient } from '../../utils/supabaseAdmin'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function toSafeAdminDeleteError(error: { status?: number; message?: string }) {
  const message = error.message?.toLowerCase() ?? ''
  if (message.includes('storage') || message.includes('object') || message.includes('bucket')) {
    return createError({
      statusCode: 409,
      statusMessage: 'Account storage cleanup required',
    })
  }

  if (error.status === 429) {
    return createError({
      statusCode: 429,
      statusMessage: 'Account deletion rate limited',
    })
  }

  return createError({
    statusCode: 500,
    statusMessage: 'Account deletion failed',
  })
}

export default defineEventHandler(async (event) => {
  const session = await requireSupabaseSessionFromCookies(event)
  const body = await readBody<{
    emailConfirmation?: string
  }>(event) ?? {}

  const emailConfirmation = normalizeEmail(body.emailConfirmation)
  if (!emailConfirmation || !EMAIL_PATTERN.test(emailConfirmation)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid email confirmation',
    })
  }

  const sessionEmail = normalizeEmail(session.user.email)
  if (!sessionEmail) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Session email is unavailable',
    })
  }

  if (emailConfirmation !== sessionEmail) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Email confirmation mismatch',
    })
  }

  const admin = getSupabaseAdminClient()
  const { error } = await admin.auth.admin.deleteUser(session.user.id, true)
  if (error) {
    throw toSafeAdminDeleteError(error)
  }

  clearAuthSessionCookies(event)

  return {
    ok: true as const,
  }
})
