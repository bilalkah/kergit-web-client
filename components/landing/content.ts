export type Accent = 'violet' | 'cyan' | 'emerald' | 'amber' | 'blue'

export type IconName =
  | 'bolt'
  | 'wave'
  | 'stack'
  | 'gauge'
  | 'shield'
  | 'moderation'
  | 'group'
  | 'controller'
  | 'cube'
  | 'chat'
  | 'screen'
  | 'pin'
  | 'phone'
  | 'desktop'
  | 'video'

export const accentPalette: Record<Accent, Record<string, string>> = {
  violet: {
    '--accent': '#8b5cf6',
    '--accent-soft': 'rgba(139, 92, 246, 0.18)',
    '--accent-border': 'rgba(139, 92, 246, 0.28)',
    '--accent-glow': 'rgba(139, 92, 246, 0.35)',
  },
  cyan: {
    '--accent': '#22d3ee',
    '--accent-soft': 'rgba(34, 211, 238, 0.16)',
    '--accent-border': 'rgba(34, 211, 238, 0.24)',
    '--accent-glow': 'rgba(34, 211, 238, 0.3)',
  },
  emerald: {
    '--accent': '#34d399',
    '--accent-soft': 'rgba(52, 211, 153, 0.16)',
    '--accent-border': 'rgba(52, 211, 153, 0.24)',
    '--accent-glow': 'rgba(52, 211, 153, 0.28)',
  },
  amber: {
    '--accent': '#fbbf24',
    '--accent-soft': 'rgba(251, 191, 36, 0.14)',
    '--accent-border': 'rgba(251, 191, 36, 0.2)',
    '--accent-glow': 'rgba(251, 191, 36, 0.24)',
  },
  blue: {
    '--accent': '#60a5fa',
    '--accent-soft': 'rgba(96, 165, 250, 0.16)',
    '--accent-border': 'rgba(96, 165, 250, 0.22)',
    '--accent-glow': 'rgba(96, 165, 250, 0.3)',
  },
}

export interface CardItem {
  title: string
  description: string
  icon: IconName
  accent: Accent
}

export interface BetaPhase {
  phase: string
  label: string
  subtitle: string
  active?: boolean
}

export interface RoadmapMilestone {
  phase: string
  title: string
  description: string
  badge: string
  icon: IconName
  accent: Accent
  tags: string[]
  status: 'active' | 'next' | 'planned'
}

export interface UseCaseLine {
  initials: string
  name: string
  text: string
}

export interface UseCaseItem {
  title: string
  subtitle: string
  icon: IconName
  accent: Accent
  lines: UseCaseLine[]
  footer: string
}

export interface TurkeyNode {
  city: string
  status: string
  detail: string
  accent: Accent
}

export const whyItems: CardItem[] = [
  {
    title: 'Düşük Ping',
    description: "Trafik Türkiye içinde kaldığı için sesli iletişimde gecikme düşük kalır.",
    icon: 'bolt',
    accent: 'cyan',
  },
  {
    title: 'Yüksek Hız',
    description: 'Yerel ağ rotalarıyla bağlanma ve mesajlaşma daha hızlı, deneyim daha akıcı olur.',
    icon: 'stack',
    accent: 'violet',
  },
  {
    title: 'Kararlı Ses',
    description: "WebRTC ses akışı Türkiye çıkışlı sunucular üzerinden daha stabil ve kesintiye daha dayanıklıdır.",
    icon: 'wave',
    accent: 'emerald',
  },
]

export const betaPhases: BetaPhase[] = [
  { phase: 'Aşama 1', label: 'Canlı Özellikler', subtitle: 'Kamera + Ekran + Ses (Geliştiriliyor)', active: true },
  { phase: 'Aşama 2', label: 'Masaüstü Uygulama', subtitle: 'Sıradaki' },
  { phase: 'Aşama 3', label: 'Mobil Uygulama', subtitle: 'Planlandı' },
]

export const betaChecklist = [
  'Kamera açma özelliği aktif (iyileştirmeler sürüyor)',
  'Ekran paylaşımı aktif (iyileştirmeler sürüyor)',
  'Sesli iletişim aktif (iyileştirmeler sürüyor)',
  'Bağlantı kararlılığı ve kalite geliştirmeleri devam ediyor',
]

export const roadmapMilestones: RoadmapMilestone[] = [
  {
    phase: 'Aşama 01',
    title: 'Canlı Özellikler + Geliştirmeler',
    description: 'Kamera açma, ekran paylaşımı ve sesli iletişim şu anda aktif. Bu özelliklerde performans ve kalite iyileştirmeleri canlı olarak sürüyor.',
    badge: 'Şimdi',
    icon: 'video',
    accent: 'violet',
    tags: ['Kamera Açma', 'Ekran Paylaşımı', 'Sesli İletişim', 'Sürekli İyileştirme'],
    status: 'active',
  },
  {
    phase: 'Aşama 02',
    title: 'Masaüstü Uygulama',
    description: 'Windows, macOS ve Linux için yerel masaüstü istemcisi. Daha akıcı kullanım, daha düşük kaynak tüketimi ve gelişmiş masaüstü deneyimi.',
    badge: 'Sıradaki',
    icon: 'desktop',
    accent: 'cyan',
    tags: ['Yerel İstemci', 'Düşük Kaynak', 'Push-to-Talk', 'Masaüstü Entegrasyonu'],
    status: 'next',
  },
  {
    phase: 'Aşama 03',
    title: 'Mobil Uygulama',
    description: 'iOS ve Android uygulamalarıyla her yerden bağlanma. Düşük pil tüketimi ve mobil ağlarda kararlı bağlantı önceliklidir.',
    badge: 'Planlandı',
    icon: 'phone',
    accent: 'emerald',
    tags: ['Yerel iOS', 'Yerel Android', 'Düşük Pil Tüketimi', 'Mobil Bildirimler'],
    status: 'planned',
  },
]

export const valueItems: CardItem[] = [
  {
    title: 'Önce Gizlilik',
    description: 'Gereksiz veri açığa çıkmaz. Hizmeti çalışır durumda tutmak için yalnızca gerekli olanı toplarız.',
    icon: 'shield',
    accent: 'violet',
  },
  {
    title: 'Kötüye Kullanım Önleme',
    description: 'Platforma gömülü aktif moderasyon mimarisi. Güvenlik altyapının bir parçasıdır.',
    icon: 'moderation',
    accent: 'cyan',
  },
  {
    title: 'Saygılı Topluluklar',
    description: 'Sağlıklı topluluk standartlarını destekleyen araçlarla kullanıcıları kötü niyetli kişilerden korumak için tasarlandı.',
    icon: 'group',
    accent: 'emerald',
  },
]

export const useCases: UseCaseItem[] = [
  {
    title: 'Oyun oynarken',
    subtitle: 'Oyun içi iletişim',
    icon: 'controller',
    accent: 'violet',
    lines: [
      { initials: 'K', name: 'Kral', text: 'Sağdan geliyor!' },
      { initials: 'S', name: 'Selim', text: 'Seni görüyorum, kapıyı al.' },
    ],
    footer: 'ping: 14ms',
  },
  {
    title: 'Ders çalışırken',
    subtitle: 'Çevrimiçi çalışma grupları',
    icon: 'cube',
    accent: 'cyan',
    lines: [
      { initials: 'E', name: 'Eif', text: "Saat 14:10'da başlıyoruz." },
      { initials: 'Y', name: 'Yusuf', text: 'Hazırım.' },
    ],
    footer: '3 kişi aktif',
  },
  {
    title: 'Tartışırken',
    subtitle: 'Topluluklar ve gruplar',
    icon: 'chat',
    accent: 'emerald',
    lines: [
      { initials: 'M', name: 'Moderatör', text: 'Konuya dönelim.' },
      { initials: 'H', name: 'Hasan', text: 'Haklısın, özür.' },
    ],
    footer: '12 kişi çevrimiçi',
  },
  {
    title: 'Birlikte izlerken',
    subtitle: 'Senkron izleme partileri',
    icon: 'screen',
    accent: 'amber',
    lines: [
      { initials: 'S', name: 'Selin', text: 'Dur dur bu sahneye bak.' },
      { initials: 'B', name: 'Burak', text: 'Harika sahne geliyor.' },
    ],
    footer: '5 kişi izliyor',
  },
]

export const turkeyHighlights = [
  {
    title: 'Yerel Altyapı',
    description: "Aktif altyapı şu anda İstanbul'da konumlu ve yerel bağlantı için optimize edildi.",
    icon: 'pin' as IconName,
    accent: 'violet' as Accent,
  },
  {
    title: 'Bölgeye Optimize',
    description: 'İstanbul merkezli düşük gecikme hedefiyle çalışıyoruz, yeni bölgeler yakında eklenecek.',
    icon: 'bolt' as IconName,
    accent: 'amber' as Accent,
  },
  {
    title: 'Topluluk Odaklı',
    description: 'Türk çevrimiçi topluluklarının iletişim kurma biçimine göre tasarlandı.',
    icon: 'shield' as IconName,
    accent: 'blue' as Accent,
  },
]

export const turkeyNodes: TurkeyNode[] = [
  {
    city: 'İstanbul',
    status: 'Aktif',
    detail: "Şu an yalnızca İstanbul sunucusu aktif. Diğer bölgeler yakında eklenecek.",
    accent: 'violet',
  },
]
