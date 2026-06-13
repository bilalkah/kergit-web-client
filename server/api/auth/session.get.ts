import { defineEventHandler } from 'h3'
import { getFreshSupabaseSession } from '../../utils/authSession'

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const statusCode = (error as { statusCode?: unknown }).statusCode
  return typeof statusCode === 'number' ? statusCode : null
}

export default defineEventHandler(async (event) => {
  try {
    return await getFreshSupabaseSession(event)
  } catch (error: unknown) {
    if (getErrorStatus(error) === 401) {
      return {
        status: 'unauthenticated' as const,
        session: null,
      }
    }
    throw error
  }
})
