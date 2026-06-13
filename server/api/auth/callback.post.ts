import { createError, defineEventHandler, readBody } from 'h3'
import { normalizeEmailChangeAuthCallbackPayload } from '@/src/utils/authCallback'
import { exchangeSupabaseSession } from '../../utils/authSession'

export default defineEventHandler(async (event) => {
  const payload = normalizeEmailChangeAuthCallbackPayload(await readBody<unknown>(event))

  if (!payload) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid email change auth callback',
    })
  }

  return {
    session: await exchangeSupabaseSession(event, payload.access_token, payload.refresh_token),
  }
})
