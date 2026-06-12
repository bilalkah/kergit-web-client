<script setup lang="ts">
import LandingMetricCard from './MetricCard.vue'
import LandingSectionHeading from './SectionHeading.vue'
import { toNonNegativeInteger } from '@/src/utils/number'

const props = defineProps<{
  roundTripMs?: number | null
  activeWebRtcUsers?: number | null
  totalActiveUsers?: number | null
}>()

const roundTrip = ref<number | null>(null)
const activeWebRtcUsers = ref<number | null>(null)
const totalActiveUsers = ref<number | null>(null)

const roundTripValue = computed(() =>
  roundTrip.value === null ? '--' : String(roundTrip.value)
)
const roundTripSuffix = computed(() =>
  roundTrip.value === null ? '' : 'ms'
)

const activeWebRtcUsersValue = computed(() => {
  if (activeWebRtcUsers.value === null) return '--'
  return new Intl.NumberFormat('tr-TR').format(activeWebRtcUsers.value)
})

const totalActiveUsersValue = computed(() => {
  if (totalActiveUsers.value === null) return '--'
  return new Intl.NumberFormat('tr-TR').format(totalActiveUsers.value)
})

watch(
  () => props.roundTripMs,
  (nextRoundTripMs) => {
    roundTrip.value = toNonNegativeInteger(nextRoundTripMs)
  },
  { immediate: true }
)

watch(
  () => props.activeWebRtcUsers,
  (nextActiveWebRtcUsers) => {
    activeWebRtcUsers.value = toNonNegativeInteger(nextActiveWebRtcUsers)
  },
  { immediate: true }
)

watch(
  () => props.totalActiveUsers,
  (nextTotalActiveUsers) => {
    totalActiveUsers.value = toNonNegativeInteger(nextTotalActiveUsers)
  },
  { immediate: true }
)
</script>

<template>
  <section id="performance" class="performance-section">
    <LandingSectionHeading eyebrow="Metrikler" title="Hız İçin Üretildi" centered />

    <div class="performance-section__grid">
      <LandingMetricCard
        title="Gidiş-Dönüş Süresi"
        description="örnek kurulum için ölçülen anlık ağ gecikmesi"
        :value="roundTripValue"
        :suffix="roundTripSuffix"
        icon="gauge"
        accent="cyan"
      />

      <LandingMetricCard
        title="Aktif WebRTC İletişimi"
        description="Anlık WebRTC iletişimindeki kullanıcı sayısı"
        :value="activeWebRtcUsersValue"
        suffix=""
        icon="wave"
        accent="violet"
      />

      <LandingMetricCard
        title="Toplam Aktif Kullanıcı"
        description="Anlık aktif kullanıcı sayısı"
        :value="totalActiveUsersValue"
        suffix=""
        icon="group"
        accent="emerald"
      />
    </div>
  </section>
</template>

<style scoped>
.performance-section {
  padding: 6rem 0 1rem;
}

.performance-section__grid {
  position: relative;
  display: grid;
  gap: 1.35rem;
  margin-top: 3rem;
}

@media (min-width: 900px) {
  .performance-section__grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
