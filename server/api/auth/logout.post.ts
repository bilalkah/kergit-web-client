import { defineEventHandler } from 'h3'
import { logoutSupabaseSession } from '../../utils/authSession'

export default defineEventHandler(async (event) => {
  await logoutSupabaseSession(event)
  return { ok: true }
})
