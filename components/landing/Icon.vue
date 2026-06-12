<script setup lang="ts">
import type { IconName } from './content'

defineProps<{
  name: IconName
}>()
</script>

<template>
  <svg v-if="name === 'bolt'" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M13 2 5 13h5l-1 9 10-13h-5l-1-7Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
      stroke-linejoin="round" />
  </svg>

  <svg v-else-if="name === 'wave'" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 12h2l2-4 3 8 2-4 2 2 3-6 2 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
      stroke-linejoin="round" />
  </svg>

  <svg v-else-if="name === 'stack'" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 3 4 7l8 4 8-4-8-4Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
      stroke-linejoin="round" />
    <path d="m4 12 8 4 8-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
      stroke-linejoin="round" />
    <path d="m4 17 8 4 8-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
      stroke-linejoin="round" />
  </svg>

  <svg v-else-if="name === 'gauge'" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 16a7 7 0 1 1 14 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    <path d="m12 12 4-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    <path d="M12 12v1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
  </svg>

  <svg v-else-if="name === 'shield'" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 3 6 5.5V11c0 4.1 2.4 7.8 6 9 3.6-1.2 6-4.9 6-9V5.5L12 3Z" stroke="currentColor"
      stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
  </svg>

  <svg v-else-if="name === 'moderation'" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 3 6 5.5V11c0 4.1 2.4 7.8 6 9 3.6-1.2 6-4.9 6-9V5.5L12 3Z" stroke="currentColor"
      stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    <path d="m8 8 8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
  </svg>

  <svg v-else-if="name === 'group'" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M16 20v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1" stroke="currentColor" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round" />
    <path d="M10 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round" />
    <path d="M20 20v-1a4 4 0 0 0-3-3.87" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
      stroke-linejoin="round" />
    <path d="M16 5.1a3 3 0 0 1 0 5.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
      stroke-linejoin="round" />
  </svg>

  <svg v-else-if="name === 'controller'" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="4" y="8" width="16" height="8" rx="4" stroke="currentColor" stroke-width="1.8" />
    <path d="M9 10.5v3M7.5 12h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    <path d="M15.5 11.5h.01M17.5 13.5h.01" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" />
  </svg>

  <svg v-else-if="name === 'cube'" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="m12 3 7 4v10l-7 4-7-4V7l7-4Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
      stroke-linejoin="round" />
    <path d="m12 12 7-4M12 12 5 8m7 4v9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
      stroke-linejoin="round" />
  </svg>

  <svg v-else-if="name === 'chat'" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6 18 4 20v-4a7 7 0 0 1 7-7h5a4 4 0 0 1 4 4v0a4 4 0 0 1-4 4H6Z" stroke="currentColor"
      stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
  </svg>

  <svg v-else-if="name === 'screen'" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="5" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.8" />
    <path d="M8 20h8M12 17v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
  </svg>

  <svg v-else-if="name === 'pin'" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 21s6-5.8 6-11a6 6 0 1 0-12 0c0 5.2 6 11 6 11Z" stroke="currentColor" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="12" cy="10" r="2" stroke="currentColor" stroke-width="1.8" />
  </svg>

  <svg v-else-if="name === 'phone'" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="7" y="3" width="10" height="18" rx="2" stroke="currentColor" stroke-width="1.8" />
    <path d="M11 18h2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
  </svg>

  <svg v-else-if="name === 'desktop'" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.8" />
    <path d="M8 20h8M12 16v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
  </svg>

  <svg v-else-if="name === 'video'" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="7" width="13" height="10" rx="2" stroke="currentColor" stroke-width="1.8" />
    <path d="m16 10 5-3v10l-5-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
      stroke-linejoin="round" />
  </svg>
</template>

<style scoped>
svg {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
