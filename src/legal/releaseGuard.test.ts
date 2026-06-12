import { describe, expect, it } from 'vitest'
import {
  LEGAL_INFO,
  type LegalInfo,
} from './legalInfo'
import {
  assertLegalDocumentsReadyForRelease,
  getLegalReleaseIssues,
} from './releaseGuard'

const rootDir = process.cwd()
const completeLegalInfo: LegalInfo = LEGAL_INFO
const placeholderLegalValue = ['CHANGE', 'ME'].join('_')

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
