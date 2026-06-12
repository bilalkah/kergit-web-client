type LogArg = unknown

const REDACTED = '[REDACTED]'
const SENSITIVE_KEY_PARTS = [
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'email',
  'user_id',
  'identity',
  'participant',
  'rtc',
  'stats',
]

function isDevRuntime(): boolean {
  const importMetaDev =
    typeof import.meta !== 'undefined' &&
    typeof (import.meta as { dev?: boolean }).dev === 'boolean' &&
    (import.meta as { dev?: boolean }).dev === true

  const nodeEnvDev =
    typeof process !== 'undefined' &&
    typeof process.env?.NODE_ENV === 'string' &&
    process.env.NODE_ENV !== 'production'

  return importMetaDev || nodeEnvDev
}

function shouldRedactKey(key: string): boolean {
  const lowered = key.toLowerCase()
  return SENSITIVE_KEY_PARTS.some(part => lowered.includes(part))
}

function redactValue(value: LogArg, seen: WeakSet<object>): LogArg {
  if (value === null || value === undefined) return value

  const valueType = typeof value
  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean' || valueType === 'bigint') {
    return value
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  }

  if (Array.isArray(value)) {
    return value.map(item => redactValue(item, seen))
  }

  if (valueType !== 'object') return value

  const objectValue = value as Record<string, unknown>
  if (seen.has(objectValue)) return '[Circular]'
  seen.add(objectValue)

  const redacted: Record<string, unknown> = {}
  for (const [key, innerValue] of Object.entries(objectValue)) {
    if (shouldRedactKey(key)) {
      redacted[key] = REDACTED
      continue
    }
    redacted[key] = redactValue(innerValue, seen)
  }
  return redacted
}

function sanitizeArgs(args: LogArg[]): LogArg[] {
  const seen = new WeakSet<object>()
  return args.map(arg => redactValue(arg, seen))
}

function emit(logger: (...args: LogArg[]) => void, args: LogArg[]) {
  if (!isDevRuntime()) return
  logger(...sanitizeArgs(args))
}

export function devLog(...args: LogArg[]) {
  emit(console.log, args)
}

export function devWarn(...args: LogArg[]) {
  emit(console.warn, args)
}

export function devError(...args: LogArg[]) {
  emit(console.error, args)
}
