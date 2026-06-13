import { defineEventHandler } from 'h3'
import { getFreshSupabaseSession } from '../../utils/authSession'

export default defineEventHandler(async (event) => {
  return getFreshSupabaseSession(event)
})
