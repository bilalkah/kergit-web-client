import { createError, defineEventHandler, readBody } from 'h3'
import { computeAccountEmailHash, isValidEmail, normalizeEmail } from '../../utils/accountEmail'
import { getSupabaseAdminClient } from '../../utils/supabaseAdmin'
import { logSafeServerFailure } from '../../utils/safeServerDiagnostics'

const KERGIT_APP_SCHEMA = 'kergit_app'
const ROUTE = 'auth/signup-precheck'

// Signup precheck:
// - blocks reuse of an email that belongs to a deleted account (HMAC digest only;
//   the plain email is never stored), and
// - reports an already-taken username before hitting Supabase Auth signup, so the
//   user sees a specific message instead of a generic "Database error saving new user".
//
// Active duplicate email handling stays Supabase Auth's responsibility.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string; username?: string }>(event) ?? {}

  const email = normalizeEmail(body.email)
  if (!email || !isValidEmail(email)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid email',
    })
  }

  // user_name is stored lowercase; the unique index is on lower(user_name).
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''

  const admin = getSupabaseAdminClient()

  if (username) {
    const { data, error } = await admin
      .schema(KERGIT_APP_SCHEMA)
      .from('profiles')
      .select('user_id')
      .eq('user_name', username)
      .limit(1)

    if (error) {
      // Best-effort: if the profiles lookup is unavailable (e.g. the service role
      // cannot read kergit_app.profiles in this environment), do not block signup.
      // The unique index on user_name plus the signup error mapping still surface
      // a taken username to the user.
      logSafeServerFailure(ROUTE, { stage: 'username_availability' }, error)
    } else if (Array.isArray(data) && data.length > 0) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Username is not available',
        data: { reason: 'username_taken' },
      })
    }
  }

  const emailHash = computeAccountEmailHash(email)

  const { data, error } = await admin
    .schema(KERGIT_APP_SCHEMA)
    .rpc('is_email_reserved', { p_email_hash: emailHash })

  if (error) {
    logSafeServerFailure(ROUTE, { stage: 'is_email_reserved' }, error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Signup precheck failed',
    })
  }

  if (data === true) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Email is not available',
      data: { reason: 'email_reserved' },
    })
  }

  return {
    available: true as const,
  }
})
