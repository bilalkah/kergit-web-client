// SERVER-ONLY secret-safe diagnostics. Never pass raw request bodies, headers,
// cookies, sessions, emails, tokens, or full Supabase responses to a logger —
// wrap them with these helpers first.

import { logServerError } from '@/src/utils/safeLogger'

export const REDACTED = '[REDACTED]'

const MAX_STRING_LENGTH = 300
const MAX_DEPTH = 3
const MAX_ARRAY_LENGTH = 10
const TRUNCATED = '…[truncated]'

// Credential-bearing key fragments: any key CONTAINING one is dropped. These are
// specific enough not to clobber useful context.
const DANGEROUS_KEY_SUBSTRINGS = [
  'authorization',
  'cookie', // also covers set-cookie
  'token', // access_token / refresh_token / accessToken / idToken
  'jwt',
  'password',
  'secret',
  'apikey',
  'servicerole', // serviceRoleKey
  'service_role',
  'email',
  'body', // requestBody
  'header', // headers / requestHeaders
  'session', // sessionData / sessionId
]

// Broad words that are dropped only on an EXACT key match, so that useful
// identifiers like `requestId`, `responseStatus`, or `storageKey` survive while
// a raw `request` / `response` / `key` field is still redacted.
const DANGEROUS_KEY_EXACT = new Set(['request', 'response', 'key'])

function isDangerousKey(key: string): boolean {
  const lowered = key.toLowerCase()
  if (DANGEROUS_KEY_EXACT.has(lowered)) return true
  return DANGEROUS_KEY_SUBSTRINGS.some((part) => lowered.includes(part))
}

// Dangerous value substrings: each replaces only the matched span with REDACTED,
// so surrounding safe text (e.g. a SQL error description) is preserved.
const STRING_REDACTORS: Array<(input: string) => string> = [
  // Bearer tokens
  (s) => s.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, REDACTED),
  // JWT-looking strings (incl. Supabase anon/service-role JWTs). The base64url
  // header `eyJ…` (= `{"…`) is itself a strong signal, so redact it plus any
  // trailing `.segment`s regardless of their length.
  (s) => s.replace(/eyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+)*/g, REDACTED),
  // Email addresses
  (s) => s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, REDACTED),
  // URL query params whose name implies a credential
  (s) =>
    s.replace(
      /([?&][^=&\s]*(?:token|code|secret|key|jwt|password|sig)[^=&\s]*)=([^&\s#]+)/gi,
      `$1=${REDACTED}`,
    ),
  // Long random-looking credentials (40+ chars). UUIDs (<=36) are preserved.
  (s) => s.replace(/[A-Za-z0-9_-]{40,}/g, REDACTED),
]

function truncate(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) return value
  return value.slice(0, MAX_STRING_LENGTH) + TRUNCATED
}

/**
 * Redact dangerous substrings from a string, then bound its length.
 * Safe to call on any provider message/statusMessage/details/hint.
 */
export function redactDiagnosticString(value: string): string {
  let out = value
  for (const redactor of STRING_REDACTORS) {
    out = redactor(out)
  }
  return truncate(out)
}

/**
 * Recursively redact an arbitrary value into a log-safe shape:
 * - dangerous keys -> "[REDACTED]"
 * - dangerous string spans -> "[REDACTED]", strings truncated
 * - depth/array-length bounded, circular references handled.
 */
export function redactDiagnosticValue(value: unknown): unknown {
  return redactInternal(value, 0, new WeakSet<object>())
}

function redactInternal(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value

  const t = typeof value
  if (t === 'string') return redactDiagnosticString(value as string)
  if (t === 'number' || t === 'boolean') return value
  if (t === 'bigint') return `${(value as bigint).toString()}n`
  if (t === 'function' || t === 'symbol') return `[${t}]`

  if (value instanceof Error) {
    return describeSafeServerError(value)
  }

  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return '[Array]'
    if (seen.has(value)) return '[Circular]'
    seen.add(value)
    const limited = value.slice(0, MAX_ARRAY_LENGTH).map((item) => redactInternal(item, depth + 1, seen))
    if (value.length > MAX_ARRAY_LENGTH) {
      limited.push(`[+${value.length - MAX_ARRAY_LENGTH} more]`)
    }
    return limited
  }

  if (t === 'object') {
    const obj = value as Record<string, unknown>
    if (depth >= MAX_DEPTH) return '[Object]'
    if (seen.has(obj)) return '[Circular]'
    seen.add(obj)
    const out: Record<string, unknown> = {}
    for (const [key, inner] of Object.entries(obj)) {
      out[key] = isDangerousKey(key) ? REDACTED : redactInternal(inner, depth + 1, seen)
    }
    return out
  }

  return `[${t}]`
}

type SafeErrorShape = {
  name?: string
  statusCode?: number
  status?: number
  code?: string
  message?: string
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

// A `code` field cannot be blindly trusted: an unknown error (or a value
// spoofing a provider error) could put an email/token/secret there. Preserve
// only normal PostgREST/Postgres/Auth/HTTP-style codes (PGRST202, 42703, 23505,
// 429, …); redact + truncate anything else.
function safeProviderCode(code: unknown): string | undefined {
  const raw = stringOrUndefined(typeof code === 'number' ? String(code) : code)
  if (!raw) return undefined

  if (/^[A-Z0-9_]{2,32}$/.test(raw) || /^[0-9]{3,5}$/.test(raw)) {
    return raw
  }

  return redactDiagnosticString(raw)
}

/**
 * Normalize ANY thrown value into a small, log-safe shape. Never trusts the raw
 * message: it is redacted and truncated. Unknown errors fall back to type info.
 */
export function describeSafeServerError(error: unknown): SafeErrorShape {
  if (error instanceof Error) {
    const e = error as Error & { statusCode?: unknown; status?: unknown; code?: unknown }
    return prune({
      name: e.name,
      statusCode: numberOrUndefined(e.statusCode),
      status: numberOrUndefined(e.status),
      code: safeProviderCode(e.code),
      message: e.message ? redactDiagnosticString(e.message) : undefined,
    })
  }

  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>
    const rawMessage = stringOrUndefined(e.message) ?? stringOrUndefined(e.statusMessage)
    return prune({
      name: stringOrUndefined(e.name),
      statusCode: numberOrUndefined(e.statusCode),
      status: numberOrUndefined(e.status),
      code: safeProviderCode(e.code),
      message: rawMessage ? redactDiagnosticString(rawMessage) : undefined,
    })
  }

  if (typeof error === 'string') {
    return { message: redactDiagnosticString(error) }
  }

  return { name: `[${typeof error}]` }
}

type SafeSupabaseErrorShape = SafeErrorShape & {
  details?: string
  hint?: string
}

/**
 * Supabase / PostgREST / GoTrue error → log-safe shape. Codes and HTTP status
 * are preserved verbatim (e.g. PGRST202, 42703, 23505, 429) because they are
 * non-sensitive and the most useful signal; message/details/hint are redacted
 * and truncated. The full provider response object is never returned.
 */
export function describeSafeSupabaseError(error: unknown): SafeSupabaseErrorShape {
  if (!error || typeof error !== 'object') {
    return describeSafeServerError(error)
  }

  const e = error as Record<string, unknown>
  return prune({
    name: stringOrUndefined(e.name),
    status: numberOrUndefined(e.status) ?? numberOrUndefined(e.statusCode),
    code: safeProviderCode(e.code),
    message: stringOrUndefined(e.message) ? redactDiagnosticString(e.message as string) : undefined,
    details: stringOrUndefined(e.details) ? redactDiagnosticString(e.details as string) : undefined,
    hint: stringOrUndefined(e.hint) ? redactDiagnosticString(e.hint as string) : undefined,
  })
}

function prune<T extends Record<string, unknown>>(obj: T): T {
  for (const key of Object.keys(obj)) {
    if (obj[key] === undefined) delete obj[key]
  }
  return obj
}

// PostgREST/Supabase errors expose code/details/hint; route those through the
// Supabase describer (which preserves code/status). Everything else is generic.
function describeSafeError(error: unknown): SafeErrorShape | SafeSupabaseErrorShape {
  if (error && typeof error === 'object' && ('hint' in error || 'details' in error || 'code' in error)) {
    return describeSafeSupabaseError(error)
  }
  return describeSafeServerError(error)
}

/**
 * The single logging entry point for server routes. Emits a redacted,
 * size-bounded diagnostic so individual routes never reimplement redaction:
 *
 *   logSafeServerFailure('chat/attachments/upload', { stage, bucket }, err)
 *
 * `route` and `context` (stage/requestId/userId/ids/provider code+status) are
 * preserved when safe; secrets/tokens/cookies/emails/bodies are dropped.
 */
export function logSafeServerFailure(
  route: string,
  context: Record<string, unknown> = {},
  error?: unknown,
): void {
  const payload: Record<string, unknown> = { route, ...context }
  if (error !== undefined) {
    payload.error = describeSafeError(error)
  }
  logServerError(`[${route}] failed`, redactDiagnosticValue(payload))
}

/**
 * Non-error server diagnostics (warnings, cache events, blocked redirects, etc.).
 * The same redaction guarantees as logSafeServerFailure: context is passed
 * through redactDiagnosticValue before emitting, so raw URLs/bodies/headers/
 * cookies/sessions/tokens/provider payloads never reach the logs. Routes must
 * use this instead of calling console.* directly.
 *
 *   logSafeServerDiagnostic('[chat/link-preview]', { stage, reason, status })
 */
export function logSafeServerDiagnostic(
  label: string,
  context: Record<string, unknown> = {},
): void {
  logServerError(label, redactDiagnosticValue(context))
}
