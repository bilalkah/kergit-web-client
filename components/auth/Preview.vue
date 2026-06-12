<script setup lang="ts">
type PreviewVariant = 'login' | 'signup' | 'reset'

const props = withDefaults(defineProps<{
  variant?: PreviewVariant
}>(), {
  variant: 'login',
})

const waveformBars = [
  { base: 0.48, duration: '1180ms', delay: '-120ms' },
  { base: 0.8, duration: '1320ms', delay: '-540ms' },
  { base: 0.68, duration: '1240ms', delay: '-240ms' },
  { base: 0.58, duration: '1160ms', delay: '-680ms' },
  { base: 0.9, duration: '1380ms', delay: '-460ms' },
  { base: 0.54, duration: '1140ms', delay: '-180ms' },
  { base: 0.98, duration: '1420ms', delay: '-760ms' },
  { base: 0.64, duration: '1260ms', delay: '-380ms' },
] as const

const previewMap = {
  login: {
    eyebrow: 'Canlı Erişim',
    title: 'Oturum aç, kanalına geri dön',
    description: 'Yerel altyapı ve düşük gecikmeli ses oturumları, kimlik doğrulamadan sonra anında hazır kalır.',
    metrics: [
      { label: 'ortalama ping', value: '18ms' },
      { label: 'oturum doğrulama', value: '<1s' },
      { label: 'kararlılık', value: '99.9%' },
    ],
    highlights: [
      'TR içinde optimize ağ uçları',
      'Canlı ses kanalı sinyali',
      'Topluluk için hızlı geri dönüş',
    ],
  },
  signup: {
    eyebrow: 'Hızlı Kurulum',
    title: 'Hesabını oluştur, beta akışına dahil ol',
    description: 'Kayıt akışı performans odaklı, sade ve güvenli. E-posta doğrulaması tamamlanınca uygulamaya doğrudan geçiş sağlanır.',
    metrics: [
      { label: 'kurulum süresi', value: '2dk' },
      { label: 'güvenli doğrulama', value: 'aktif' },
      { label: 'topluluk erişimi', value: 'hazır' },
    ],
    highlights: [
      'Yerel performans odaklı başlangıç',
      'Sözleşme ve gizlilik akışı kart içinde',
      'Doğrulama sonrası doğrudan giriş',
    ],
  },
  reset: {
    eyebrow: 'Güvenli Kurtarma',
    title: 'Şifreni yenile, erişimini koru',
    description: 'Tek kullanımlık bağlantılar, doğrulanmış oturum değişimi ve güvenli parola güncellemesi aynı akışta birleşir.',
    metrics: [
      { label: 'bağlantı doğrulama', value: 'tek kullanımlık' },
      { label: 'oturum değişimi', value: 'güvenli' },
      { label: 'hesap koruması', value: 'yüksek' },
    ],
    highlights: [
      'Şifre kurtarma bağlantısı doğrulanır',
      'Hata durumları açık şekilde gösterilir',
      'Yeni parola akışı kararlı kalır',
    ],
  },
} as const

const preview = computed(() => previewMap[props.variant])
</script>

<template>
  <div class="auth-preview">
    <div class="auth-preview__panel">
      <p class="auth-preview__eyebrow">{{ preview.eyebrow }}</p>
      <h2 class="auth-preview__title">{{ preview.title }}</h2>
      <p class="auth-preview__description">{{ preview.description }}</p>

      <div class="auth-preview__wave">
        <span class="auth-preview__wave-status">
          <span class="auth-preview__wave-dot" />
          sistem hazır
        </span>
        <div class="auth-preview__wave-bars" aria-hidden="true">
          <span
            v-for="(bar, index) in waveformBars"
            :key="index"
            class="auth-preview__wave-bar"
            :style="{
              '--bar-base': `${bar.base}`,
              '--bar-duration': bar.duration,
              '--bar-delay': bar.delay,
            }"
          />
        </div>
      </div>

      <div class="auth-preview__metrics">
        <div v-for="metric in preview.metrics" :key="metric.label" class="auth-preview__metric">
          <span class="auth-preview__metric-label">{{ metric.label }}</span>
          <strong class="auth-preview__metric-value">{{ metric.value }}</strong>
        </div>
      </div>

      <div class="auth-preview__list">
        <div v-for="item in preview.highlights" :key="item" class="auth-preview__list-item">
          <span class="auth-preview__list-dot" />
          <span>{{ item }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-preview {
  position: relative;
}

.auth-preview::before,
.auth-preview::after {
  content: '';
  position: absolute;
  border-radius: 999px;
  filter: blur(48px);
  pointer-events: none;
}

.auth-preview::before {
  width: 9rem;
  height: 9rem;
  top: 8%;
  right: 12%;
  background: rgba(96, 165, 250, 0.16);
}

.auth-preview::after {
  width: 10rem;
  height: 10rem;
  left: 0;
  bottom: 6%;
  background: rgba(139, 92, 246, 0.14);
}

.auth-preview__panel {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(125, 146, 202, 0.14);
  border-radius: 30px;
  background:
    linear-gradient(180deg, rgba(6, 10, 28, 0.92), rgba(3, 8, 22, 0.9)),
    radial-gradient(circle at top right, rgba(34, 211, 238, 0.08), transparent 34%),
    radial-gradient(circle at bottom left, rgba(139, 92, 246, 0.1), transparent 32%);
  padding: 1.5rem;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 32px 80px -54px rgba(5, 8, 23, 0.96);
  backdrop-filter: blur(18px);
}

.auth-preview__eyebrow {
  margin: 0;
  color: #22d3ee;
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.auth-preview__title {
  margin: 0.9rem 0 0;
  color: #f8fbff;
  font-family: 'Space Grotesk', 'Manrope', sans-serif;
  font-size: clamp(1.8rem, 3vw, 2.5rem);
  font-weight: 700;
  letter-spacing: -0.05em;
  line-height: 1.02;
}

.auth-preview__description {
  margin: 0.9rem 0 0;
  color: rgba(186, 195, 223, 0.8);
  line-height: 1.8;
}

.auth-preview__wave {
  margin-top: 1.4rem;
  border: 1px solid rgba(125, 146, 202, 0.12);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.03);
  padding: 1rem;
}

.auth-preview__wave-status {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: #05efb0;
  font-size: 0.84rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.auth-preview__wave-dot {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 999px;
  background: #05efb0;
  box-shadow: 0 0 18px rgba(5, 239, 176, 0.6);
}

.auth-preview__wave-bars {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 0.35rem;
  align-items: center;
  height: 2.3rem;
  margin-top: 0.95rem;
}

.auth-preview__wave-bar {
  display: block;
  height: calc(var(--bar-base) * 1.3rem + 0.55rem);
  border-radius: 999px;
  background: linear-gradient(180deg, #2bdeff 0%, #7b5cff 100%);
  box-shadow:
    0 0 16px rgba(79, 145, 255, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
  transform-origin: center center;
  animation: authWave var(--bar-duration) cubic-bezier(0.32, 0.08, 0.24, 1) infinite both;
  animation-delay: var(--bar-delay);
}

.auth-preview__metrics {
  display: grid;
  gap: 0.75rem;
  margin-top: 1.3rem;
}

.auth-preview__metric {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border: 1px solid rgba(125, 146, 202, 0.1);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.03);
  padding: 0.9rem 0.95rem;
}

.auth-preview__metric-label {
  color: rgba(186, 195, 223, 0.72);
  font-size: 0.84rem;
  text-transform: lowercase;
}

.auth-preview__metric-value {
  color: #f8fbff;
  font-family: 'Space Grotesk', 'Manrope', sans-serif;
  font-size: 1rem;
  letter-spacing: -0.03em;
}

.auth-preview__list {
  display: grid;
  gap: 0.8rem;
  margin-top: 1.35rem;
}

.auth-preview__list-item {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  color: rgba(226, 232, 250, 0.84);
  font-size: 0.92rem;
}

.auth-preview__list-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
  background: linear-gradient(135deg, #22d3ee, #8b5cf6);
  box-shadow: 0 0 12px rgba(96, 165, 250, 0.36);
}

@keyframes authWave {
  0%,
  100% {
    transform: scaleY(0.78);
    opacity: 0.9;
  }

  22% {
    transform: scaleY(1.34);
    opacity: 1;
  }

  46% {
    transform: scaleY(0.76);
    opacity: 0.84;
  }

  66% {
    transform: scaleY(1.42);
    opacity: 1;
  }

  84% {
    transform: scaleY(0.86);
    opacity: 0.9;
  }
}

@media (max-width: 1099px) {
  .auth-preview__panel {
    padding: 1.25rem;
    border-radius: 24px;
  }
}
</style>
