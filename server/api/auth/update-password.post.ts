import { createError, defineEventHandler, readBody } from 'h3'
import { updateSupabasePassword } from '../../utils/authSession'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    password?: string
  }>(event)

  const password = body.password?.trim()
  if (!password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Password is required',
    })
  }

  await updateSupabasePassword(event, password)

  return { ok: true }
})
