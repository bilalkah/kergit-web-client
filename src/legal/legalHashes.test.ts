import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PRIVACY_NOTICE_DOCUMENT_SHA256,
  PRIVACY_NOTICE_VERSION,
  TERMS_DOCUMENT_SHA256,
  TERMS_VERSION,
} from './constants'

const rootDir = process.cwd()

// Canonical procedure: hash the LF-normalized markdown SOURCE (never rendered
// HTML, never browser/runtime output). Must match scripts/verify-legal-hashes.mjs.
function hashLegalSource(path: string) {
  const markdown = readFileSync(resolve(rootDir, path), 'utf8')
  return createHash('sha256').update(markdown.replace(/\r\n/g, '\n'), 'utf8').digest('hex')
}

describe('legal document hash integrity', () => {
  it('TERMS_DOCUMENT_SHA256 matches the user-agreement source markdown', () => {
    expect(hashLegalSource(`src/legal/documents/user-agreement.${TERMS_VERSION}.tr.md`))
      .toBe(TERMS_DOCUMENT_SHA256)
  })

  it('PRIVACY_NOTICE_DOCUMENT_SHA256 matches the privacy-notice source markdown', () => {
    expect(hashLegalSource(`src/legal/documents/privacy-notice.${PRIVACY_NOTICE_VERSION}.tr.md`))
      .toBe(PRIVACY_NOTICE_DOCUMENT_SHA256)
  })

  it('uses lowercase hex SHA-256 constants', () => {
    expect(TERMS_DOCUMENT_SHA256).toMatch(/^[0-9a-f]{64}$/)
    expect(PRIVACY_NOTICE_DOCUMENT_SHA256).toMatch(/^[0-9a-f]{64}$/)
  })
})
