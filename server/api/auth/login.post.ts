import { createError, defineEventHandler, readBody } from 'h3'
import { loginSupabaseSession } from '../../utils/authSession'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    email?: string
    password?: string
  }>(event)

  const email = body.email?.trim()
  const password = body.password

  if (!email || !password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email and password are required',
    })
  }

  return {
    session: await loginSupabaseSession(event, email, password),
  }
})
