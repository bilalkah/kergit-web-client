import { defineEventHandler } from 'h3'
import {
  forceRefreshSupabaseSessionFromCookies,
  toAuthSessionResponse,
} from '../../utils/authSession'

export default defineEventHandler(async (event) => {
  const session = await forceRefreshSupabaseSessionFromCookies(event)
  return toAuthSessionResponse(session)
})
