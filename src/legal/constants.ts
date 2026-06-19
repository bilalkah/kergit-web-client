export const TERMS_VERSION = 'alpha-1'
export const PRIVACY_NOTICE_VERSION = 'alpha-1'
export const LEGAL_LOCALE = 'tr-TR'

// SHA-256 (hex, lowercase) of the LF-normalized legal markdown SOURCE files.
// Procedure: read src/legal/documents/<doc>.<version>.tr.md, replace CRLF with LF,
// sha256. Enforced by src/legal/legalHashes.test.ts and scripts/verify-legal-hashes.mjs.
// These static values are sent as signup proof metadata and validated by the SQL
// legal-proof trigger; do NOT compute them at runtime in the browser.
export const TERMS_DOCUMENT_SHA256 =
  '155811d1bf243f68381140a63aafc5680233a413e7a7ff2289265d2c8ec75ad9'
export const PRIVACY_NOTICE_DOCUMENT_SHA256 =
  'f82668be160aeedc2a95e742ef325b1384c6d5b0b2ac2943fa80f514f29f7404'

export const AGE_DECLARATION_REQUIRED = true
