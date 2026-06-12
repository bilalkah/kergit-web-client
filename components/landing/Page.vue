<script setup lang="ts">
import LandingBetaSection from './BetaSection.vue'
import LandingFinalCta from './FinalCta.vue'
import LandingHeader from './Header.vue'
import LandingHeroSection from './HeroSection.vue'
import LandingPerformanceSection from './PerformanceSection.vue'
import LandingRoadmapSection from './RoadmapSection.vue'
import LandingTurkeySection from './TurkeySection.vue'
import LandingUseCasesSection from './UseCasesSection.vue'
import LandingWhySection from './WhySection.vue'
import { useLandingMetrics } from '~/composables/useLandingMetrics'

const ONLINE_COUNT_POLL_INTERVAL_MS = 10_000
const PING_POLL_INTERVAL_MS = 15_000

type LandingPresenceResponse = {
  status?: string
  online_users?: number | null
}

type LandingVoicePresenceResponse = {
  status?: string
  active_webrtc_users?: number | null
}

const onlineCount = ref(0)
const activeWebRtcUsers = ref(0)
const roundTripMs = ref<number | null>(null)
let landingMetricsTimer: number | null = null
let pingTimer: number | null = null

const { fetchPingRoundTripMs, normalizeMetricCount } = useLandingMetrics()

async function refreshOnlineCount() {
  try {
    const response = await $fetch<LandingPresenceResponse>('/ws/presence/online', {
      method: 'POST',
    })
    onlineCount.value = normalizeMetricCount(response?.online_users)
  } catch {
    onlineCount.value = 0
  }
}

async function refreshActiveWebRtcUsers() {
  try {
    const response = await $fetch<LandingVoicePresenceResponse>('/ws/presence/voice-active', {
      method: 'POST',
    })
    activeWebRtcUsers.value = normalizeMetricCount(response?.active_webrtc_users)
  } catch {
    activeWebRtcUsers.value = 0
  }
}

async function refreshLandingMetrics() {
  await Promise.all([
    refreshOnlineCount(),
    refreshActiveWebRtcUsers(),
  ])
}

function startLandingMetricsPolling() {
  void refreshLandingMetrics()
  if (landingMetricsTimer !== null) {
    window.clearInterval(landingMetricsTimer)
  }
  landingMetricsTimer = window.setInterval(() => {
    void refreshLandingMetrics()
  }, ONLINE_COUNT_POLL_INTERVAL_MS)
}

function stopLandingMetricsPolling() {
  if (landingMetricsTimer !== null) {
    window.clearInterval(landingMetricsTimer)
    landingMetricsTimer = null
  }
}

async function refreshRoundTripMs() {
  roundTripMs.value = await fetchPingRoundTripMs()
}

function startPingPolling() {
  void refreshRoundTripMs()
  if (pingTimer !== null) {
    window.clearInterval(pingTimer)
  }
  pingTimer = window.setInterval(() => {
    void refreshRoundTripMs()
  }, PING_POLL_INTERVAL_MS)
}

function stopPingPolling() {
  if (pingTimer !== null) {
    window.clearInterval(pingTimer)
    pingTimer = null
  }
}

onMounted(() => {
  startLandingMetricsPolling()
  startPingPolling()
})

onBeforeUnmount(() => {
  stopLandingMetricsPolling()
  stopPingPolling()
})
</script>

<template>
  <div class="landing-page">
    <div class="landing-page__grid" aria-hidden="true" />
    <div class="landing-page__aurora landing-page__aurora--violet" aria-hidden="true" />
    <div class="landing-page__aurora landing-page__aurora--cyan" aria-hidden="true" />

    <LandingHeader />

    <main class="landing-page__content">
      <LandingHeroSection
        :online-count="onlineCount"
        :ping-ms="roundTripMs"
      />
      <LandingWhySection />
      <LandingBetaSection />
      <LandingRoadmapSection />
      <LandingPerformanceSection
        :round-trip-ms="roundTripMs"
        :active-web-rtc-users="activeWebRtcUsers"
        :total-active-users="onlineCount"
      />
      <LandingUseCasesSection />
      <LandingTurkeySection />
      <LandingFinalCta />
    </main>
  </div>
</template>

<style scoped>
.landing-page {
  --page-bg: #030612;
  position: relative;
  overflow: clip;
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(37, 99, 235, 0.18), transparent 30%),
    radial-gradient(circle at 85% 10%, rgba(139, 92, 246, 0.18), transparent 26%),
    linear-gradient(180deg, #020511 0%, #030816 28%, #02040d 100%);
  color: #f8fbff;
}

.landing-page__content {
  position: relative;
  z-index: 1;
  max-width: 78rem;
  margin: 0 auto;
  padding: 0 clamp(1rem, 2vw, 2rem);
}

.landing-page__grid {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: 0.32;
  background-image:
    linear-gradient(rgba(71, 85, 150, 0.12) 1px, transparent 1px),
    linear-gradient(90deg, rgba(71, 85, 150, 0.1) 1px, transparent 1px);
  background-size: 3.2rem 3.2rem;
  mask-image: radial-gradient(circle at center, rgba(0, 0, 0, 0.9), transparent 95%);
  animation: gridDrift 22s linear infinite;
}

.landing-page__aurora {
  position: fixed;
  z-index: 0;
  inset: auto;
  width: 32rem;
  height: 32rem;
  border-radius: 999px;
  filter: blur(110px);
  opacity: 0.2;
  pointer-events: none;
}

.landing-page__aurora--violet {
  top: -8rem;
  right: -10rem;
  background: rgba(139, 92, 246, 0.75);
  animation: auroraFloat 18s ease-in-out infinite alternate;
}

.landing-page__aurora--cyan {
  top: 24rem;
  left: -12rem;
  background: rgba(34, 211, 238, 0.5);
  animation: auroraFloat 20s ease-in-out infinite alternate-reverse;
}

@keyframes gridDrift {
  from {
    transform: translate3d(0, 0, 0);
  }

  to {
    transform: translate3d(0, 3.2rem, 0);
  }
}

@keyframes auroraFloat {
  0% {
    transform: translate3d(0, 0, 0) scale(1);
  }

  100% {
    transform: translate3d(3rem, 2rem, 0) scale(1.08);
  }
}
</style>
