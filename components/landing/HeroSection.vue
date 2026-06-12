<script setup lang="ts">
import LandingPrimaryCta from './PrimaryCta.vue'
import appVersionRaw from '~/VERSION?raw'
import MessageBubble from '~/components/ui/MessageBubble.vue'
import { toNonNegativeInteger } from '@/src/utils/number'

const props = defineProps<{
  onlineCount?: number | null
  pingMs?: number | null
}>()

const appVersion = appVersionRaw.trim()

type HeroMockMessage = {
  id: string
  author: string
  own: boolean
  time: string
  text: string
}

const mockMessages: HeroMockMessage[] = [
  { id: 'm1', author: 'Mert', own: false, time: '18:06', text: 'Genelde misiniz, ses testi yapalım mı?' },
  { id: 'm2', author: 'Merve', own: false, time: '18:07', text: 'Ben geldim, ses tertemiz.' },
  { id: 'm3', author: 'Sen', own: true, time: '18:08', text: 'Süper, ben de bağlandım.' },
  { id: 'm4', author: 'Sen', own: true, time: '18:08', text: 'Toplantı dokümanı hazır mı?' },
  { id: 'm5', author: 'Ece', own: false, time: '18:09', text: 'Hazır, linki kanala sabitledim.' },
  { id: 'm6', author: 'Ahmet', own: false, time: '18:10', text: 'İlk demoyu 10 dakika içinde açıyorum.' },
  { id: 'm7', author: 'Sen', own: true, time: '18:11', text: 'Tamamdır, ben buradayım.' },
  { id: 'm8', author: 'Sen', own: true, time: '18:11', text: 'Başlayınca haber verin.' },
]

const pingMs = ref<number | null>(null)
const onlineCount = ref(0)

const currentPingLabel = computed(() => (
  pingMs.value === null ? '--' : `${pingMs.value}ms`
))
const formattedOnlineCount = computed(() =>
  new Intl.NumberFormat('tr-TR').format(onlineCount.value)
)
const renderedMessages = computed(() =>
  mockMessages.map((message, index) => ({
    ...message,
    initial: message.author.slice(0, 1).toUpperCase(),
    grouped: index > 0 && mockMessages[index - 1]?.author === message.author,
  }))
)

const accentForAuthor = (author: string) => {
  if (author === 'Sen') return '#22d3ee'
  const accents = ['#60a5fa', '#a78bfa', '#34d399', '#f59e0b']
  let total = 0
  for (const ch of author) total += ch.charCodeAt(0)
  return accents[total % accents.length]
}

watch(
  () => props.onlineCount,
  (nextOnlineCount) => {
    onlineCount.value = toNonNegativeInteger(nextOnlineCount) ?? 0
  },
  { immediate: true }
)

watch(
  () => props.pingMs,
  (nextPingMs) => {
    pingMs.value = toNonNegativeInteger(nextPingMs)
  },
  { immediate: true }
)
</script>

<template>
  <section id="top" class="hero-section">
    <div class="hero-section__copy">
      <div class="hero-section__release">{{ appVersion }}</div>

      <h1 class="hero-section__title">
        <span>Gerçek zamanlı iletişim.</span>
        <strong>Hızlı ve zahmetsiz.</strong>
      </h1>

      <p class="hero-section__description">
        Türkiye'deki oyuncular, öğrenciler ve topluluklar için düşük gecikmeli sesli iletişim ve mesajlaşma.
      </p>

      <div class="hero-section__actions">
        <LandingPrimaryCta size="lg" />
        <a class="hero-section__secondary" href="#roadmap">
          <span>Yol haritası</span>
          <span aria-hidden="true">-&gt;</span>
        </a>
      </div>

      <dl class="hero-section__stats">
        <div>
          <dt>&lt;40ms</dt>
          <dd>WebRTC gecikmesi</dd>
        </div>
        <div>
          <dt>99.9%</dt>
          <dd>çalışma süresi</dd>
        </div>
        <div>
          <dt>TR</dt>
          <dd>sunucular</dd>
        </div>
      </dl>
    </div>

    <div class="hero-section__panel-wrap">
      <span class="hero-section__signal hero-section__signal--one" />
      <span class="hero-section__signal hero-section__signal--two" />
      <span class="hero-section__signal hero-section__signal--three" />

      <div class="hero-panel">
        <section class="hero-panel__chat">
          <div class="hero-panel__messages">
            <div class="hero-panel__message-stream" aria-label="Kergit genel sohbet önizleme">
              <div
                v-for="message in renderedMessages"
                :key="message.id"
                class="hero-chat-row"
                :class="{ 'from-me': message.own, grouped: message.grouped }"
              >
                <div class="hero-chat-avatar-slot">
                  <span v-if="!message.grouped" class="hero-chat-avatar" :class="{ own: message.own }">
                    {{ message.initial }}
                  </span>
                  <span v-else class="hero-chat-avatar-spacer" aria-hidden="true" />
                </div>

                <div class="hero-chat-block" :class="{ 'from-me': message.own }">
                  <div v-if="!message.grouped" class="hero-chat-meta" :class="{ 'from-me': message.own }">
                    <span class="hero-chat-name" :style="{ color: accentForAuthor(message.author) }">
                      {{ message.author }}
                    </span>
                    <span class="hero-chat-time">{{ message.time }}</span>
                  </div>

                  <div class="hero-chat-bubble-wrap" :class="{ 'from-me': message.own }">
                    <MessageBubble :is-own="message.own">
                      {{ message.text }}
                    </MessageBubble>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="hero-panel__divider hero-panel__divider--footer" aria-hidden="true" />

          <div class="hero-panel__footer">
            <div class="hero-panel__online">
              <span class="hero-panel__online-dot" />
              <span class="hero-panel__online-count">{{ formattedOnlineCount }}</span>
              <span class="hero-panel__online-copy">çevrimiçi</span>
            </div>

            <div class="hero-panel__ping hero-panel__ping--footer">
              <span>ping:</span>
              <strong>{{ currentPingLabel }}</strong>
            </div>
          </div>
        </section>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero-section {
  display: grid;
  gap: 48px;
  align-items: center;
  padding: 84px 0 72px;
}

.hero-section__copy {
  max-width: 37rem;
}

.hero-section__release {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
  border: 1px solid rgba(34, 211, 238, 0.24);
  border-radius: 999px;
  padding: 8px 14px;
  color: #67e8f9;
  background: rgba(34, 211, 238, 0.08);
  font-family: var(--ui-font-mono, 'JetBrains Mono', monospace);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.hero-section__title {
  margin: 0;
  color: #f8fbff;
  font-family: 'Space Grotesk', 'Manrope', sans-serif;
  font-size: clamp(3.25rem, 8vw, 6rem);
  font-weight: 700;
  letter-spacing: -0.065em;
  line-height: 0.94;
}

.hero-section__title strong {
  display: block;
  background: linear-gradient(135deg, #8b5cf6 0%, #60a5fa 48%, #22d3ee 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.hero-section__description {
  margin: 24px 0 0;
  max-width: 33rem;
  color: rgba(177, 186, 216, 0.92);
  font-size: clamp(1.05rem, 1.5vw, 1.32rem);
  line-height: 1.8;
}

.hero-section__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 32px;
}

.hero-section__secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 56px;
  padding: 0 24px;
  border: 1px solid rgba(125, 146, 202, 0.18);
  border-radius: 16px;
  color: #dce4ff;
  background: rgba(10, 14, 34, 0.52);
  font-weight: 600;
  transition:
    background 220ms ease-out,
    border-color 220ms ease-out,
    transform 220ms ease-out;
}

.hero-section__secondary:hover {
  transform: translateY(-1px);
  border-color: rgba(125, 146, 202, 0.28);
  background: rgba(12, 18, 42, 0.7);
}

.hero-section__stats {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  max-width: 31rem;
  margin-top: 40px;
  padding-top: 24px;
  border-top: 1px solid rgba(125, 146, 202, 0.13);
}

.hero-section__stats dt {
  margin: 0;
  color: #f8fbff;
  font-family: 'Space Grotesk', 'Manrope', sans-serif;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.05em;
}

.hero-section__stats dd {
  margin: 6px 0 0;
  color: rgba(139, 151, 185, 0.82);
  font-size: 15px;
  line-height: 1.6;
}

.hero-section__panel-wrap {
  position: relative;
  width: min(100%, 446px);
  justify-self: end;
}

.hero-section__signal {
  position: absolute;
  border-radius: 999px;
  background:
    radial-gradient(circle, rgba(139, 92, 246, 0.44), rgba(96, 165, 250, 0.1) 58%, transparent 76%);
  opacity: 0.7;
  filter: blur(14px);
  pointer-events: none;
}

.hero-section__signal--one {
  top: -16px;
  left: -12px;
  width: 86px;
  height: 86px;
  animation: floatSignal 8.8s ease-in-out infinite;
}

.hero-section__signal--two {
  top: 74px;
  right: -28px;
  width: 102px;
  height: 102px;
  animation: floatSignal 8s ease-in-out infinite reverse;
}

.hero-section__signal--three {
  left: 24px;
  bottom: -18px;
  width: 94px;
  height: 94px;
  animation: floatSignal 10.2s ease-in-out infinite;
}

.hero-panel {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--ui-border-mid, rgba(255, 255, 255, 0.05));
  border-radius: 18px;
  background:
    radial-gradient(circle at 18% 0%, rgba(34, 211, 238, 0.08), transparent 28%),
    radial-gradient(circle at 86% 12%, rgba(124, 58, 237, 0.1), transparent 28%),
    var(--ui-bg-chat, #0c0f1e);
  box-shadow:
    0 22px 56px -38px rgba(2, 6, 23, 0.88),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  font-family: var(--ui-font-sans, 'Inter', 'Segoe UI', sans-serif);
  transition:
    transform 240ms ease-out,
    box-shadow 240ms ease-out,
    border-color 240ms ease-out;
}

.hero-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.01));
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}

.hero-panel::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.02) 1px, transparent 1px);
  background-size: 40px 40px;
  opacity: 0.18;
  pointer-events: none;
}

.hero-panel:hover {
  transform: translateY(-3px);
  border-color: rgba(148, 163, 184, 0.22);
  box-shadow:
    0 28px 68px -40px rgba(2, 6, 23, 0.92),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.hero-panel__chat {
  position: relative;
  z-index: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 420px;
}

.hero-panel__messages,
.hero-panel__footer,
.hero-panel__divider {
  position: relative;
  z-index: 1;
  padding-inline: 18px;
}

.hero-panel__ping,
.hero-panel__footer {
  font-family: var(--ui-font-sans, 'Inter', 'Segoe UI', sans-serif);
}

.hero-panel__ping {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: rgba(203, 213, 225, 0.78);
  font-family: var(--ui-font-mono, 'JetBrains Mono', monospace);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.hero-panel__ping strong {
  color: var(--ui-accent-cyan, #22d3ee);
  font-weight: 600;
}

.hero-panel__ping--footer {
  color: rgba(203, 213, 225, 0.88);
  font-size: 13px;
}

.hero-panel__divider {
  height: 1px;
  background: linear-gradient(
    90deg,
    rgba(148, 163, 184, 0.04),
    var(--ui-border-soft, rgba(255, 255, 255, 0.04)),
    rgba(148, 163, 184, 0.04)
  );
}

.hero-panel__divider--footer {
  margin-top: 8px;
}

.hero-panel__messages {
  display: flex;
  flex: 1;
  min-height: 0;
  padding-top: 18px;
  padding-bottom: 18px;
}

.hero-panel__message-stream {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-inline: 4px;
  display: flex;
  flex-direction: column;
}

.hero-panel__message-stream::-webkit-scrollbar {
  width: 6px;
}

.hero-panel__message-stream::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.18);
}

.hero-chat-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-top: 16px;
}

.hero-chat-row.grouped {
  margin-top: 2px;
}

.hero-chat-row.from-me {
  flex-direction: row-reverse;
}

.hero-chat-avatar-slot {
  width: 32px;
  flex: 0 0 32px;
  display: flex;
  justify-content: center;
}

.hero-chat-avatar {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(7, 18, 43, 0.9);
  border: 1px solid rgba(96, 165, 250, 0.28);
  color: #7dd3fc;
  font-size: 12px;
  font-weight: 700;
  font-family: var(--ui-font-mono, 'JetBrains Mono', monospace);
}

.hero-chat-avatar.own {
  background: rgba(88, 28, 135, 0.34);
  border-color: rgba(167, 139, 250, 0.42);
  color: #ddd6fe;
}

.hero-chat-avatar-spacer {
  width: 32px;
  height: 32px;
  display: block;
}

.hero-chat-block {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.hero-chat-block.from-me {
  align-items: flex-end;
}

.hero-chat-meta {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}

.hero-chat-meta.from-me {
  justify-content: flex-end;
}

.hero-chat-name {
  font-size: 14px;
  font-weight: 600;
}

.hero-chat-time {
  font-family: var(--ui-font-mono, 'JetBrains Mono', monospace);
  font-size: 11px;
  color: #4a5568;
}

.hero-chat-bubble-wrap {
  position: relative;
  align-items: center;
  display: flex;
  width: 100%;
  max-width: 100%;
}

.hero-chat-bubble-wrap.from-me {
  justify-content: flex-end;
}

.hero-chat-bubble-wrap :deep(.ui-message-bubble) {
  max-width: min(72%, 280px);
  font-size: 13px;
  line-height: 1.45;
}

.hero-panel__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-top: 12px;
  padding-bottom: 16px;
}

.hero-panel__online {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.hero-panel__online-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--ui-accent-green, #34d399);
  box-shadow: 0 0 10px rgba(52, 211, 153, 0.62);
}

.hero-panel__online-count {
  color: var(--ui-accent-green, #34d399);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.03em;
  font-family: var(--ui-font-mono, 'JetBrains Mono', monospace);
}

.hero-panel__online-copy {
  color: rgba(230, 236, 252, 0.56);
  font-size: 14px;
  font-weight: 500;
}

@media (min-width: 1120px) {
  .hero-section {
    grid-template-columns: minmax(0, 1.02fr) minmax(24rem, 28rem);
  }
}

@media (max-width: 1119px) {
  .hero-section__panel-wrap {
    justify-self: center;
  }
}

@media (max-width: 640px) {
  .hero-section {
    gap: 40px;
    padding-top: 68px;
  }

  .hero-section__copy {
    margin-inline: auto;
    text-align: center;
  }

  .hero-section__description {
    margin-inline: auto;
  }

  .hero-section__stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px 12px;
    margin-inline: auto;
    text-align: center;
    justify-items: center;
  }

  .hero-section__stats dt {
    font-size: 22px;
  }

  .hero-section__stats dd {
    font-size: 14px;
  }

  .hero-section__actions {
    width: 100%;
    max-width: 26rem;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-inline: auto;
  }

  .hero-section__actions :deep(.primary-cta--lg),
  .hero-section__secondary {
    width: 100%;
    min-width: 0;
    min-height: 54px;
    padding-inline: 16px;
  }

  .hero-panel__messages,
  .hero-panel__footer,
  .hero-panel__divider {
    padding-inline: 16px;
  }

  .hero-panel__message-stream {
    padding-inline: 16px;
  }
}

@media (max-width: 480px) {
  .hero-section__actions {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero-section__signal,
  .hero-panel {
    animation: none;
    transition: none;
  }
}

@keyframes floatSignal {
  0%,
  100% {
    transform: translate3d(0, 0, 0);
  }

  50% {
    transform: translate3d(0, -10px, 0);
  }
}

</style>
