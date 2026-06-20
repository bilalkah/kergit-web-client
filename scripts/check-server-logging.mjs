#!/usr/bin/env node
// Regression guard: server API/route code must not bypass safe production
// logging. Uses a real TypeScript parser (@typescript-eslint/typescript-estree)
// and inspects CallExpression nodes — no regex/string scanning of source, so
// tokens inside comments or string literals never cause false positives.
//
// Always blocked (outside the exempt diagnostics util):
//   console.error(...) / console.warn(...) / console.info(...)
//   logServerError(...)
//
// Routes must use the safe helpers instead:
//   logSafeServerFailure(route, context, error)   // error paths
//   logSafeServerDiagnostic(label, context)        // warnings / diagnostics
//
// Exempt: server/utils/safeServerDiagnostics.ts (the one place raw logging
// lives). Ignored: *.test.ts / *.spec.ts.
//
// Run: pnpm check:server-logging   (also: pnpm audit:server)

import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from '@typescript-eslint/typescript-estree'
import fg from 'fast-glob'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const SCAN_PATTERNS = ['server/api/**/*.ts', 'server/routes/**/*.ts', 'server/utils/**/*.ts']
const IGNORE = ['**/*.test.ts', '**/*.spec.ts']
const EXEMPT_FILES = new Set(['server/utils/safeServerDiagnostics.ts'])

const FORBIDDEN_CONSOLE_METHODS = new Set(['error', 'warn', 'info'])
const FORBIDDEN_FUNCTIONS = new Set(['logServerError'])

// Yield every AST node reachable from `node`.
function* walk(node) {
  if (!node || typeof node.type !== 'string') return
  yield node
  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue
    const value = node[key]
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child.type === 'string') yield* walk(child)
      }
    } else if (value && typeof value.type === 'string') {
      yield* walk(value)
    }
  }
}

function describeForbiddenCall(callNode) {
  const callee = callNode.callee

  // console.error / console.warn / console.info — ALWAYS forbidden in routes.
  // No "redacted argument" exception: a route could still pass raw args beside
  // a redacted one. Use logSafeServerDiagnostic / logSafeServerFailure instead.
  if (
    callee.type === 'MemberExpression'
    && !callee.computed
    && callee.object.type === 'Identifier'
    && callee.object.name === 'console'
    && callee.property.type === 'Identifier'
    && FORBIDDEN_CONSOLE_METHODS.has(callee.property.name)
  ) {
    return `console.${callee.property.name}(...)`
  }

  // logServerError(...) — always forbidden in routes; use the safe helpers.
  if (callee.type === 'Identifier' && FORBIDDEN_FUNCTIONS.has(callee.name)) {
    return `${callee.name}(...)`
  }

  return null
}

/**
 * Analyze a single TypeScript source. Returns violations [{ rel, line, what }].
 * Exempt files and parse-clean safe files return []. Exported for tests.
 */
export function analyzeServerLoggingSource(code, rel) {
  const normalizedRel = rel.split('\\').join('/')
  if (EXEMPT_FILES.has(normalizedRel)) return []

  let ast
  try {
    ast = parse(code, { loc: true, range: false, jsx: false })
  } catch (error) {
    return [{ rel: normalizedRel, line: error?.lineNumber ?? 0, what: `parse error: ${error?.message ?? error}` }]
  }

  const violations = []
  for (const node of walk(ast)) {
    if (node.type !== 'CallExpression') continue
    const what = describeForbiddenCall(node)
    if (what) violations.push({ rel: normalizedRel, line: node.loc?.start?.line ?? 0, what })
  }
  return violations
}

async function runCli() {
  const files = await fg(SCAN_PATTERNS, { cwd: root, ignore: IGNORE, absolute: true })
  const violations = files.flatMap((abs) =>
    analyzeServerLoggingSource(readFileSync(abs, 'utf8'), relative(root, abs)),
  )

  if (violations.length > 0) {
    console.error('[check-server-logging] Unsafe logging in server routes/utils:')
    for (const v of violations) {
      console.error(`  - ${v.rel}:${v.line}  ${v.what}`)
    }
    console.error(
      '\nServer routes must log via logSafeServerFailure(...) / logSafeServerDiagnostic(...).\n' +
      'Direct console.* and logServerError(...) are allowed only in\n' +
      'server/utils/safeServerDiagnostics.ts.',
    )
    process.exit(1)
  }

  console.log(`[check-server-logging] OK — ${files.length} server files parsed; all logging is safe.`)
}

// Only run the CLI when invoked directly (not when imported by tests).
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  await runCli()
}
