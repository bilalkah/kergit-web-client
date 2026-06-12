import { createHmac } from 'node:crypto'
import { createError } from 'h3'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value)
}

// One-way HMAC-SHA256 of the normalized email. The plain email is never stored
// in the app database; only this hex digest is used for deleted-account
// email reservations and signup prechecks.
export function computeAccountEmailHash(normalizedEmail: string): string {
  const config = useRuntimeConfig()
  const secret = config.accountEmailHashSecret

  if (!secret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Account email hash secret is not configured (ACCOUNT_EMAIL_HASH_SECRET)',
    })
  }

  return createHmac('sha256', secret).update(normalizedEmail).digest('hex')
}
