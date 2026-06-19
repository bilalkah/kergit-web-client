import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  LEGAL_INFO,
  type LegalInfo,
} from './legalInfo'
import { PRIVACY_NOTICE_VERSION } from './constants'
import {
  assertLegalDocumentsReadyForRelease,
  getLegalReleaseIssues,
} from './releaseGuard'

const rootDir = process.cwd()
const completeLegalInfo: LegalInfo = LEGAL_INFO
const placeholderLegalValue = ['CHANGE', 'ME'].join('_')

function readPrivacyNotice() {
  return readFileSync(
    resolve(rootDir, `src/legal/documents/privacy-notice.${PRIVACY_NOTICE_VERSION}.tr.md`),
    'utf8',
  )
}

describe('legal document release guard', () => {
  it('allows complete LEGAL_INFO with one public contact email', () => {
    expect(getLegalReleaseIssues({
      rootDir,
      legalInfo: completeLegalInfo,
    })).toEqual([])
  })

  it('rejects missing or placeholder legal info values', () => {
    expect(() => assertLegalDocumentsReadyForRelease({
      rootDir,
      legalInfo: {
        ...completeLegalInfo,
        providerName: placeholderLegalValue,
      },
    })).toThrow('LEGAL_INFO.providerName')
  })

  it('rejects invalid contact email', () => {
    expect(() => assertLegalDocumentsReadyForRelease({
      rootDir,
      legalInfo: {
        ...completeLegalInfo,
        contactEmail: 'not-an-email',
      },
    })).toThrow('contactEmail')
  })

  it('rejects unresolved placeholders in rendered documents', () => {
    expect(() => assertLegalDocumentsReadyForRelease({
      rootDir,
      legalInfo: completeLegalInfo,
      termsMarkdown: 'Eksik [BİLİNMEYEN_PLACEHOLDER]',
      privacyNoticeMarkdown: 'Tamam [AD SOYAD]',
    })).toThrow('çözümlenmemiş placeholder')
  })
})

// The audit_events SQL schema has no `ip` or `user_agent` columns and explicitly
// forbids them. The privacy notice must not claim those are stored audit fields.
describe('privacy notice matches the audit_events schema', () => {
  it('does not list IP or user-agent among the stored audit/security fields', () => {
    const privacy = readPrivacyNotice()

    // The old phrasing enumerated IP/user-agent inside the "işlenebilir"
    // (processed/stored) identifier list. That must be gone.
    expect(privacy).not.toContain('bağlantı kimliği, IP adresi, tarayıcı bilgisi (user-agent)')
  })

  it('declares IP and user-agent as fields that are not written to audit logs', () => {
    const privacy = readPrivacyNotice()

    const notWrittenSentence = privacy
      .split('\n')
      .find(line => line.includes('IP adresi') && line.includes('yazılmaz'))

    expect(notWrittenSentence).toBeDefined()
    expect(notWrittenSentence).toContain('tarayıcı bilgisi (user-agent)')
  })

  it('states that live voice/camera/screen-share media is not recorded or stored', () => {
    const privacy = readPrivacyNotice()

    expect(privacy).toContain('kaydetmez, saklamaz veya dinlemez')
  })
})
