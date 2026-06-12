import { createError, defineEventHandler, readBody } from 'h3'
import { exchangeSupabaseSession } from '../../utils/authSession'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    accessToken?: string
    refreshToken?: string
  }>(event)

  const accessToken = body.accessToken?.trim()
  const refreshToken = body.refreshToken?.trim()

  if (!accessToken || !refreshToken) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Access token and refresh token are required',
    })
  }

  return {
    session: await exchangeSupabaseSession(event, accessToken, refreshToken),
  }
})
