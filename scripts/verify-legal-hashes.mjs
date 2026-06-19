#!/usr/bin/env node
// Deterministic legal-document hash verifier.
//
// Model (do NOT add runtime/browser hashing):
//   legal markdown source -> LF-normalized SHA-256 -> static constants
//   -> signup metadata -> DB legal-proof validation
//
// This script recomputes the source hashes and checks them against the static
// constants in src/legal/constants.ts. It fails (exit 1) if they desync, so a
// markdown edit without a constants update is caught in CI / pre-release.

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const legalDir = resolve(here, '../src/legal')

/** Canonical procedure: source markdown, CRLF->LF, sha256 hex lowercase. No trim. */
export function hashLegalSource(markdown) {
  return createHash('sha256').update(markdown.replace(/\r\n/g, '\n'), 'utf8').digest('hex')
}

function readConstant(constantsSource, name) {
  // Tolerates the value living on the next line (the repo's formatting).
  const match = constantsSource.match(new RegExp(`${name}\\s*=\\s*\\n?\\s*'([0-9a-f]{64})'`))
  if (!match) {
    throw new Error(`Could not read ${name} from constants.ts`)
  }
  return match[1]
}

function readVersion(constantsSource, name) {
  const match = constantsSource.match(new RegExp(`${name}\\s*=\\s*'([^']+)'`))
  if (!match) {
    throw new Error(`Could not read ${name} from constants.ts`)
  }
  return match[1]
}

const constantsSource = readFileSync(resolve(legalDir, 'constants.ts'), 'utf8')
const termsVersion = readVersion(constantsSource, 'TERMS_VERSION')
const privacyVersion = readVersion(constantsSource, 'PRIVACY_NOTICE_VERSION')

const checks = [
  {
    label: 'Terms (user-agreement)',
    path: resolve(legalDir, `documents/user-agreement.${termsVersion}.tr.md`),
    expected: readConstant(constantsSource, 'TERMS_DOCUMENT_SHA256'),
  },
  {
    label: 'Privacy/KVKK (privacy-notice)',
    path: resolve(legalDir, `documents/privacy-notice.${privacyVersion}.tr.md`),
    expected: readConstant(constantsSource, 'PRIVACY_NOTICE_DOCUMENT_SHA256'),
  },
]

let failed = false
for (const check of checks) {
  const actual = hashLegalSource(readFileSync(check.path, 'utf8'))
  const ok = actual === check.expected
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${check.label}: ${actual}`)
  if (!ok) {
    failed = true
    console.log(`      expected (constants.ts): ${check.expected}`)
  }
}

if (failed) {
  console.error(
    '\nLegal document hashes are out of sync.\n' +
    'Update TERMS_DOCUMENT_SHA256 / PRIVACY_NOTICE_DOCUMENT_SHA256 in\n' +
    'src/legal/constants.ts AND the SQL legal-proof trigger hashes to the values above.',
  )
  process.exit(1)
}

console.log('\nLegal document hashes match constants.ts.')
