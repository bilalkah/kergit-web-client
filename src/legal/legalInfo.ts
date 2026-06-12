export const LEGAL_INFO = {
  providerName: 'Bilal Kahraman',
  contactAddress: 'Denizli, Türkiye',
  contactEmail: 'destek@kergit.com',
  effectiveDate: '21.06.2026',
  competentCourt: 'Türkiye Cumhuriyeti yetkili mahkemeleri ve icra daireleri',

  hostingProvider: 'vps.tc',
  hostingRegion: 'Türkiye',
  supabaseRegion: 'İsviçre / Zürih / eu-central-2',
  emailProvider: 'Resend e-posta gönderim altyapısı',
  livekitHosting: 'Kergit tarafından seçilen sunucu altyapısı üzerinde self-host edilen LiveKit altyapısı',
  cloudflareUsage: 'Cloudflare DNS, TLS/proxy ve güvenlik hizmetleri',

  logRetention: '30 gün',
  supportRetention: '1 yıl',
  postDeletionRetention:
    'teknik loglar için 30 gün; hukuki uyuşmazlık halinde gerekli süre boyunca',
  legalRecordRetention:
    'üyelik süresince ve üyelik sona erdikten sonra 2 yıl; uyuşmazlık halinde ilgili yasal süre boyunca',
} as const

export type LegalInfo = Record<keyof typeof LEGAL_INFO, string>
