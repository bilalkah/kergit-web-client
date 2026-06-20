#!/usr/bin/env node
// CI/build guard: fail if any private secret name leaks into the client bundle.
//
// Nuxt only ships runtimeConfig.public to the browser, but this turns that
// guarantee into an enforced regression gate. Run AFTER `pnpm build`:
//
//   pnpm build && pnpm check:client-secrets
//   (or: pnpm audit:client-bundle)
//
// Scans .output/public (the browser-served bundle) for forbidden terms. Exits
// non-zero on any hit so the build fails before shipping a leaked secret.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(here, '../.output/public')

// Private secret env names and their config-key aliases. None of these may ever
// appear in browser-served output.
const FORBIDDEN_TERMS = [
  'service_role',
  'serviceRoleKey',
  'SUPABASE_SERVICE_ROLE_KEY',
  'accountEmailHashSecret',
  'ACCOUNT_EMAIL_HASH_SECRET',
  'LIVEKIT_API_SECRET',
  'JWT_SECRET',
  'RESEND_API_KEY',
  'DATABASE_URL',
  'REDIS_URL',
]

// Only scan text-like assets; skip images/fonts/etc.
const TEXT_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.css', '.html', '.json', '.txt', '.map', '.svg', '.wasm',
])

function walk(dir) {
  const files = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      files.push(...walk(full))
    } else if (TEXT_EXTENSIONS.has(extname(entry).toLowerCase()) || extname(entry) === '') {
      files.push(full)
    }
  }
  return files
}

if (!existsSync(publicDir)) {
  console.error(`[check-client-secrets] ${publicDir} not found. Run "pnpm build" first.`)
  process.exit(2)
}

const hits = []
for (const file of walk(publicDir)) {
  let content
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  for (const term of FORBIDDEN_TERMS) {
    if (content.includes(term)) {
      hits.push({ file: file.replace(publicDir, '.output/public'), term })
    }
  }
}

if (hits.length > 0) {
  console.error('[check-client-secrets] FORBIDDEN secret name found in client bundle:')
  for (const hit of hits) {
    console.error(`  - ${hit.term}  in  ${hit.file}`)
  }
  console.error('\nA private secret name leaked into browser-served output. Failing build.')
  process.exit(1)
}

console.log(`[check-client-secrets] OK — no forbidden secret names in .output/public (${FORBIDDEN_TERMS.length} terms checked).`)
