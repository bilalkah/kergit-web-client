import { defineEventHandler } from 'h3'
import {
  restoreSupabaseSessionFromCookies,
  toAuthSessionResponse,
} from '../../utils/authSession'

export default defineEventHandler(async (event) => {
  const session = await restoreSupabaseSessionFromCookies(event)
  return toAuthSessionResponse(session)
})
