import {
  PRIVACY_NOTICE_VERSION,
  TERMS_VERSION,
} from './constants'
import privacyNoticeMarkdown from './documents/privacy-notice.alpha-1.tr.md?raw'
import userAgreementMarkdown from './documents/user-agreement.alpha-1.tr.md?raw'
import type { LegalInfo } from './legalInfo'
import { renderLegalMarkdown } from './render'

export type LegalDocumentKind = 'terms' | 'privacy'

export type LegalDocumentTemplate = {
  title: string
  version: string
  rawMarkdown: string
}

export type RenderedLegalDocument = LegalDocumentTemplate & {
  markdown: string
  unresolvedPlaceholders: string[]
}

export const legalDocuments: Record<LegalDocumentKind, LegalDocumentTemplate> = {
  terms: {
    title: 'Kullanıcı Sözleşmesi',
    version: TERMS_VERSION,
    rawMarkdown: userAgreementMarkdown,
  },
  privacy: {
    title: 'Gizlilik Politikası / KVKK Aydınlatma Metni',
    version: PRIVACY_NOTICE_VERSION,
    rawMarkdown: privacyNoticeMarkdown,
  },
}

export function renderLegalDocument(
  document: LegalDocumentTemplate,
  legalInfo?: LegalInfo,
): RenderedLegalDocument {
  const rendered = renderLegalMarkdown(document.rawMarkdown, legalInfo)

  return {
    ...document,
    markdown: rendered.markdown,
    unresolvedPlaceholders: rendered.unresolvedPlaceholders,
  }
}

export function renderLegalDocumentByKind(kind: LegalDocumentKind, legalInfo?: LegalInfo) {
  return renderLegalDocument(legalDocuments[kind], legalInfo)
}
