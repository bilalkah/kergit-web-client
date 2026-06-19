import {
  createError,
  defineEventHandler,
  getRequestHeader,
  readBody,
  type H3Event,
} from 'h3'
import { clearAuthSessionCookies, requireSupabaseSessionFromCookies } from '../../utils/authSession'
import { computeAccountEmailHash, isValidEmail, normalizeEmail } from '../../utils/accountEmail'
import { getSupabaseAdminClient } from '../../utils/supabaseAdmin'
import { devError } from '@/src/utils/safeLogger'

// TODO(kergit_app-cutover):
// When the runtime C++ server fully migrates to the kergit_app schema,
// keep account deletion semantics aligned with the database/server workflow:
// - deleted users must be removed from active hub memberships,
// - historical messages must be preserved,
// - message senders for deleted accounts must be displayed as deleted_user / anonymized user,
// - original visible identity must not remain exposed through message history.
// Prefer profile anonymization/API mapping over rewriting message content.

const KERGIT_APP_SCHEMA = 'kergit_app'

// IP and user-agent are intentionally NOT collected: the audit_events schema has
// no ip/user_agent columns and the account deletion RPCs no longer accept them.
type AuditContext = {
  requestId?: string
}

// Defensive: tolerate minimal/mocked events and never throw from logging context.
function getAuditContext(event: H3Event): AuditContext {
  const context: AuditContext = {}

  try {
    context.requestId = getRequestHeader(event, 'x-request-id') ?? undefined
  } catch { /* ignore */ }

  return context
}

function toSafeAdminDeleteError(error: { status?: number; message?: string }) {
  const message = error.message?.toLowerCase() ?? ''
  if (message.includes('storage') || message.includes('object') || message.includes('bucket')) {
    return createError({
      statusCode: 409,
      statusMessage: 'Account storage cleanup required',
    })
  }

  if (error.status === 429) {
    return createError({
      statusCode: 429,
      statusMessage: 'Account deletion rate limited',
    })
  }

  return createError({
    statusCode: 500,
    statusMessage: 'Account deletion failed',
  })
}

export default defineEventHandler(async (event) => {
  const session = await requireSupabaseSessionFromCookies(event)
  const body = await readBody<{
    emailConfirmation?: string
  }>(event) ?? {}

  const emailConfirmation = normalizeEmail(body.emailConfirmation)
  if (!emailConfirmation || !isValidEmail(emailConfirmation)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid email confirmation',
    })
  }

  const sessionEmail = normalizeEmail(session.user.email)
  if (!sessionEmail) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Session email is unavailable',
    })
  }

  if (emailConfirmation !== sessionEmail) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Email confirmation mismatch',
    })
  }

  const userId = session.user.id
  const emailHash = computeAccountEmailHash(sessionEmail)
  const audit = getAuditContext(event)
  const admin = getSupabaseAdminClient()
  const db = admin.schema(KERGIT_APP_SCHEMA)

  // Step 1: atomic DB workflow (request row, owner check, reservation,
  // membership removal, profile anonymization, audit).
  const begin = await db.rpc('request_account_deletion', {
    p_user_id: userId,
    p_email_hash: emailHash,
    p_request_id: audit.requestId ?? null,
  })

  if (begin.error || !begin.data) {
    devError('[delete-account] request_account_deletion failed', {
      userId,
      requestId: audit.requestId,
      error: begin.error,
    })
    throw createError({
      statusCode: 500,
      statusMessage: 'Account deletion failed',
    })
  }

  const result = begin.data as {
    request_id: string
    status: string
    owned_hub_count?: number
  }

  if (result.status === 'blocked') {
    // Owned hubs must be handled first. No auth deletion, no cookie clearing.
    throw createError({
      statusCode: 409,
      statusMessage: 'Account has owned hubs that must be handled first',
    })
  }

  if (result.status !== 'anonymized') {
    devError('[delete-account] unexpected workflow status', {
      userId,
      requestId: audit.requestId,
      status: result.status,
    })
    throw createError({
      statusCode: 500,
      statusMessage: 'Account deletion failed',
    })
  }

  const deletionId = result.request_id

  // Step 2: Supabase Auth soft delete (cannot run inside the DB transaction).
  const { error: authError } = await admin.auth.admin.deleteUser(userId, true)
  if (authError) {
    const mapped = toSafeAdminDeleteError(authError)

    // Record failure without leaking sensitive details.
    const failure = await db.rpc('fail_account_deletion', {
      p_deletion_id: deletionId,
      p_user_id: userId,
      p_error_code: String(authError.status ?? 'unknown'),
      p_failure_reason: 'Supabase Auth soft delete failed',
      p_request_id: audit.requestId ?? null,
    })

    if (failure.error) {
      devError('[delete-account] fail_account_deletion failed', {
        userId,
        requestId: audit.requestId,
        error: failure.error,
      })
    }

    throw mapped
  }

  // Step 3: finalize DB state (best-effort; the auth user is already deleted).
  const complete = await db.rpc('complete_account_deletion', {
    p_deletion_id: deletionId,
    p_user_id: userId,
    p_request_id: audit.requestId ?? null,
  })

  if (complete.error) {
    devError('[delete-account] complete_account_deletion failed', {
      userId,
      requestId: audit.requestId,
      error: complete.error,
    })
  }

  // Step 4: clear auth cookies/session.
  clearAuthSessionCookies(event)

  return {
    ok: true as const,
  }
})
