import { createError, defineEventHandler, readBody } from 'h3'
import { updateSupabaseEmail } from '../../utils/authSession'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    email?: string
  }>(event)

  const email = body.email?.trim()
  if (!email || !EMAIL_PATTERN.test(email)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid email address',
    })
  }

  const emailRedirectTo = createEmailChangeRedirectTo()

  return {
    ok: true as const,
    user: await updateSupabaseEmail(event, email, emailRedirectTo),
    message: 'confirmation_sent' as const,
  }
})

function createEmailChangeRedirectTo(): string {
  const config = useRuntimeConfig()
  if (!config.appOrigin) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Trusted app origin is missing',
    })
  }

  let appOrigin: URL
  try {
    appOrigin = new URL(config.appOrigin)
  } catch {
    throw createError({
      statusCode: 500,
      statusMessage: 'Trusted app origin is invalid',
    })
  }

  const redirectUrl = new URL('/auth/callback', appOrigin.origin)
  redirectUrl.searchParams.set('auth_flow', 'email-change')

  return redirectUrl.toString()
}
