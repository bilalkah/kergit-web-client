import { describe, expect, it } from 'vitest'
// @ts-expect-error - plain .mjs script, no type declarations
import { analyzeServerLoggingSource } from './check-server-logging.mjs'

const ROUTE = 'server/api/foo.post.ts'

function whats(code: string, rel = ROUTE): string[] {
  return analyzeServerLoggingSource(code, rel).map((v: { what: string }) => v.what)
}

describe('check-server-logging analyzer', () => {
  it('fails on console.warn even when one argument is redactDiagnosticValue(...)', () => {
    const code = `export default () => { console.warn('[x]', redactDiagnosticValue({ a: 1 })) }`
    expect(whats(code)).toContain('console.warn(...)')
  })

  it('fails on bare console.error / console.info', () => {
    expect(whats(`export default () => { console.error('boom', e) }`)).toContain('console.error(...)')
    expect(whats(`export default () => { console.info('hi', x) }`)).toContain('console.info(...)')
  })

  it('fails on logServerError(...) in a route', () => {
    const code = `export default () => { logServerError('x', redactDiagnosticValue({ a: 1 })) }`
    expect(whats(code)).toContain('logServerError(...)')
  })

  it('passes for logSafeServerDiagnostic(...) and logSafeServerFailure(...)', () => {
    const code = `export default () => {
      logSafeServerDiagnostic('[chat/link-preview]', { stage: 's', reason: 'r' })
      logSafeServerFailure('chat/x', { stage: 's' }, new Error('y'))
    }`
    expect(analyzeServerLoggingSource(code, ROUTE)).toEqual([])
  })

  it('ignores console.* / logServerError that appear only in comments or strings', () => {
    const code = `export default () => {
      // console.error('a comment, not a call')
      const a = 'use console.warn( for debugging'
      const b = \`logServerError( in a template literal\`
      return { a, b }
    }`
    expect(analyzeServerLoggingSource(code, ROUTE)).toEqual([])
  })

  it('skips the central diagnostics utility (where raw logging lives)', () => {
    const code = `export const x = () => console.error('ok here')`
    expect(analyzeServerLoggingSource(code, 'server/utils/safeServerDiagnostics.ts')).toEqual([])
  })
})
