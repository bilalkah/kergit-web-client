import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  PRIVACY_NOTICE_VERSION,
  TERMS_VERSION,
} from './constants'
import {
  LEGAL_INFO,
  type LegalInfo,
} from './legalInfo'
import { renderLegalMarkdown } from './render'

const PLACEHOLDER_VALUE_PATTERN = /^\[[^\]]+\]$/
const PLACEHOLDER_TEXT_VALUES = [
  ['CHANGE', 'ME'].join('_'),
  'TODO',
]
const VALID_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type LegalReleaseGuardOptions = {
  rootDir: string
  legalInfo?: LegalInfo
  termsMarkdown?: string
  privacyNoticeMarkdown?: string
}

function isMissingLegalValue(value: string) {
  const trimmed = value.trim()
  const upper = trimmed.toUpperCase()

  return (
    trimmed === ''
    || PLACEHOLDER_TEXT_VALUES.includes(upper)
    || PLACEHOLDER_VALUE_PATTERN.test(trimmed)
  )
}

function isValidEmail(value: string) {
  return VALID_EMAIL_PATTERN.test(value.trim())
}

function readLegalDocument(path: string) {
  return readFileSync(path, 'utf8')
}

function defaultTermsPath(rootDir: string) {
  return resolve(rootDir, `src/legal/documents/user-agreement.${TERMS_VERSION}.tr.md`)
}

function defaultPrivacyNoticePath(rootDir: string) {
  return resolve(rootDir, `src/legal/documents/privacy-notice.${PRIVACY_NOTICE_VERSION}.tr.md`)
}

export function getLegalReleaseIssues({
  rootDir,
  legalInfo = LEGAL_INFO,
  termsMarkdown,
  privacyNoticeMarkdown,
}: LegalReleaseGuardOptions) {
  const issues: string[] = []

  for (const [key, value] of Object.entries(legalInfo)) {
    if (isMissingLegalValue(value)) {
      issues.push(`LEGAL_INFO.${key} eksik veya placeholder değer içeriyor.`)
    }
  }

  if (!isValidEmail(legalInfo.contactEmail)) {
    issues.push('LEGAL_INFO.contactEmail geçerli bir e-posta adresi olmalıdır.')
  }

  const terms = renderLegalMarkdown(
    termsMarkdown ?? readLegalDocument(defaultTermsPath(rootDir)),
    legalInfo,
  )
  const privacy = renderLegalMarkdown(
    privacyNoticeMarkdown ?? readLegalDocument(defaultPrivacyNoticePath(rootDir)),
    legalInfo,
  )

  if (terms.unresolvedPlaceholders.length > 0) {
    issues.push(`Kullanıcı Sözleşmesi çözümlenmemiş placeholder içeriyor: ${terms.unresolvedPlaceholders.join(', ')}`)
  }

  if (privacy.unresolvedPlaceholders.length > 0) {
    issues.push(`Gizlilik/KVKK metni çözümlenmemiş placeholder içeriyor: ${privacy.unresolvedPlaceholders.join(', ')}`)
  }

  return issues
}

export function assertLegalDocumentsReadyForRelease(options: LegalReleaseGuardOptions) {
  const issues = getLegalReleaseIssues(options)

  if (issues.length > 0) {
    throw new Error([
      'Legal documents are not ready for production release:',
      ...issues.map(issue => `- ${issue}`),
    ].join('\n'))
  }
}
