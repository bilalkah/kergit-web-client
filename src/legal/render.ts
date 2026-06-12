import {
  LEGAL_INFO,
  type LegalInfo,
} from './legalInfo'

export const LEGAL_PLACEHOLDER_PATTERN = /\[[^\]\n]+\]/g

export const LEGAL_PLACEHOLDER_MAP = {
  '[AD SOYAD]': 'providerName',
  '[İLETİŞİM / TEBLİGAT ADRESİ]': 'contactAddress',
  '[İLETİŞİM_EPOSTA]': 'contactEmail',
  '[YÜRÜRLÜK_TARİHİ]': 'effectiveDate',
  '[YETKİLİ MAHKEME / İCRA DAİRESİ]': 'competentCourt',
  '[HOSTING_SAĞLAYICI]': 'hostingProvider',
  '[HOSTING_ÜLKE_BÖLGE]': 'hostingRegion',
  '[SUPABASE_PROJE_BÖLGESİ]': 'supabaseRegion',
  '[EPOSTA_SAĞLAYICI]': 'emailProvider',
  '[LIVEKIT / SELF-HOST / SAĞLAYICI BİLGİSİ]': 'livekitHosting',
  '[CLOUDFLARE KULLANIM DURUMU]': 'cloudflareUsage',
  '[LOG_SAKLAMA_SÜRESİ]': 'logRetention',
  '[DESTEK_KAYDI_SAKLAMA_SÜRESİ]': 'supportRetention',
  '[SİLME_SONRASI_SAKLAMA_SÜRESİ]': 'postDeletionRetention',
  '[LEGAL_KAYIT_SAKLAMA_SÜRESİ]': 'legalRecordRetention',
} satisfies Record<string, keyof LegalInfo>

export type RenderLegalMarkdownResult = {
  markdown: string
  unresolvedPlaceholders: string[]
}

function unique(values: string[]) {
  return [...new Set(values)]
}

export function findLegalPlaceholders(markdown: string) {
  return unique(markdown.match(LEGAL_PLACEHOLDER_PATTERN) ?? [])
}

export function renderLegalMarkdown(
  markdown: string,
  legalInfo: LegalInfo = LEGAL_INFO,
): RenderLegalMarkdownResult {
  const unresolvedPlaceholders: string[] = []
  const rendered = markdown.replace(LEGAL_PLACEHOLDER_PATTERN, (placeholder) => {
    const field = LEGAL_PLACEHOLDER_MAP[placeholder as keyof typeof LEGAL_PLACEHOLDER_MAP]

    if (!field) {
      unresolvedPlaceholders.push(placeholder)
      return placeholder
    }

    return legalInfo[field]
  })

  return {
    markdown: rendered,
    unresolvedPlaceholders: unique(unresolvedPlaceholders),
  }
}
