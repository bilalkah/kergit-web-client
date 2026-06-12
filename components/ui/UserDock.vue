<script setup lang="ts">
import Avatar from '~/components/ui/Avatar.vue'
import Tooltip from '~/components/ui/Tooltip.vue'
import { useAppStore } from '~/stores/app'
import { useWebSocket } from '~/composables/useWebSocket'
import { deafenSelf, setMicrophoneMuted, undeafenSelf } from '@/src/services/webrtc/livekit'
import { userAvatarUrl } from '@/src/utils/avatar'
import { IconMic, IconMicMuted, IconHeadphones, IconHeadphonesOff } from '~/components/icons/VoiceIcons'
import { IconSettings } from '~/components/icons/Common'

const app = useAppStore()
const socket = useWebSocket()
const route = useRoute()
const isHydrated = ref(false)
const voiceJoinPulse = ref(false)
let voiceJoinPulseTimeout: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  isHydrated.value = true
})

const clearVoiceJoinPulseTimeout = () => {
  if (!voiceJoinPulseTimeout) return
  clearTimeout(voiceJoinPulseTimeout)
  voiceJoinPulseTimeout = null
}

const effectiveVoiceMuted = computed(() =>
  isHydrated.value ? app.voiceMuted : false
)

const effectiveVoiceDeafened = computed(() =>
  isHydrated.value ? app.voiceDeafened : false
)

const hasActiveVoice = computed(() => app.hasLocalActiveVoice)
const voiceControlsLocked = computed(() => app.voiceConnecting === true)
const isVoiceVisualActive = computed(() =>
  isHydrated.value && hasActiveVoice.value
)
const isLocalUserSpeaking = computed(() => {
  if (!isHydrated.value || !hasActiveVoice.value) return false
  if (!app.userId) return false
  return app.isUserSpeaking(app.userId)
})

const displayName = computed(() =>
  app.displayName || app.username || 'Sen'
)

const avatarSrc = computed(() =>
  userAvatarUrl(app.avatarSeed ?? 'Felix')
)

const isOnline = computed(() =>
  app.userId ? app.isUserOnline(app.userId) : true
)

const presenceLabel = computed(() => {
  if (hasActiveVoice.value) {
    if (effectiveVoiceDeafened.value) return 'seste sağırlaştırıldı'
    return effectiveVoiceMuted.value ? 'seste sessiz' : 'ses kanalı aktif'
  }
  return isOnline.value ? 'çevrimiçi' : 'çevrimdışı'
})

const avatarSettingsLabel = computed(() =>
  `${displayName.value} ayarlarını aç`
)

const micLabel = computed(() => {
  if (!hasActiveVoice.value) {
    if (effectiveVoiceDeafened.value) return 'Mikrofon kapalı (sağırlaştırılmış)'
    return effectiveVoiceMuted.value ? 'Mikrofonu aç (sonraki ses bağlantısı)' : 'Mikrofonu kapat (sonraki ses bağlantısı)'
  }
  return effectiveVoiceMuted.value ? 'Mikrofonu aç' : 'Mikrofonu kapat'
})

const deafenLabel = computed(() => {
  if (!hasActiveVoice.value) {
    return effectiveVoiceDeafened.value ? 'Sağırlaştırmayı kapat (sonraki ses bağlantısı)' : 'Sağırlaştır (sonraki ses bağlantısı)'
  }
  return effectiveVoiceDeafened.value ? 'Sağırlaştırmayı kapat' : 'Sağırlaştır'
})

async function toggleMic() {
  if (voiceControlsLocked.value) return
  if (app.voiceDeafened) return
  const next = !app.voiceMuted
  app.setVoiceMuted(next)
  if (hasActiveVoice.value && app.activeVoiceHubId && app.activeVoiceChannelId) {
    void socket.sendVoiceActivity(
      app.activeVoiceHubId,
      app.activeVoiceChannelId,
      next,
      app.voiceDeafened
    )
  }
  if (!hasActiveVoice.value || !import.meta.client) return
  await setMicrophoneMuted(next)
}

async function toggleDeafen() {
  if (voiceControlsLocked.value) return
  const next = !app.voiceDeafened
  app.setVoiceDeafened(next)
  app.setVoiceMuted(next ? true : false)
  if (hasActiveVoice.value && app.activeVoiceHubId && app.activeVoiceChannelId) {
    void socket.sendVoiceActivity(
      app.activeVoiceHubId,
      app.activeVoiceChannelId,
      app.voiceMuted,
      app.voiceDeafened
    )
  }
  if (!hasActiveVoice.value || !import.meta.client) return
  if (next) {
    await deafenSelf()
    return
  }
  await undeafenSelf()
}

function openSettings() {
  if (!import.meta.client) return
  window.dispatchEvent(new Event('app-open-user-settings'))
}

watch(isVoiceVisualActive, (active, wasActive) => {
  if (!active) {
    voiceJoinPulse.value = false
    clearVoiceJoinPulseTimeout()
    return
  }

  if (active && !wasActive) {
    voiceJoinPulse.value = true
    if (!import.meta.client) return
    clearVoiceJoinPulseTimeout()
    voiceJoinPulseTimeout = setTimeout(() => {
      voiceJoinPulse.value = false
      voiceJoinPulseTimeout = null
    }, 520)
  }
}, { flush: 'post' })

onBeforeUnmount(() => {
  clearVoiceJoinPulseTimeout()
})
</script>

<template>
  <div class="user-dock" :class="{ 'voice-active': isVoiceVisualActive, 'voice-join-pulse': voiceJoinPulse }">
    <Tooltip :content="avatarSettingsLabel" placement="right" full-width>
      <button
        class="avatar-rail-btn"
        type="button"
        :aria-label="avatarSettingsLabel"
        @click="openSettings"
      >
        <div class="user-avatar-wrap rail-avatar">
          <Avatar :src="avatarSrc" :alt="displayName" :size="32" :speaking="isLocalUserSpeaking" />
          <span class="user-presence" :class="{ offline: !isOnline, 'in-voice': isVoiceVisualActive }"></span>
        </div>
      </button>
    </Tooltip>

    <div class="user-main">
      <div class="user-card" :class="{ 'in-voice': isVoiceVisualActive }">
      <div class="user-info">
        <span class="username">{{ displayName }}</span>
        <Transition name="dock-status" mode="out-in">
          <span :key="presenceLabel" class="status">{{ presenceLabel }}</span>
        </Transition>
      </div>

      <div class="controls">
        <Tooltip :content="micLabel">
          <button
            class="control-btn"
            :class="{ muted: effectiveVoiceMuted || effectiveVoiceDeafened }"
            type="button"
            :disabled="effectiveVoiceDeafened || voiceControlsLocked"
            :aria-label="micLabel"
            @click="toggleMic"
          >
            <component :is="effectiveVoiceMuted || effectiveVoiceDeafened ? IconMicMuted : IconMic" :size="20" />
          </button>
        </Tooltip>

        <Tooltip :content="deafenLabel">
          <button
            class="control-btn"
            :class="{ muted: effectiveVoiceDeafened }"
            type="button"
            :disabled="voiceControlsLocked"
            :aria-label="deafenLabel"
            @click="toggleDeafen"
          >
            <component :is="effectiveVoiceDeafened ? IconHeadphonesOff : IconHeadphones" :size="20" />
          </button>
        </Tooltip>

        <Tooltip v-if="route.path !== '/app'" content="Kullanıcı ayarları">
          <button
            class="control-btn"
            type="button"
            aria-label="Kullanıcı ayarları"
            @click="openSettings"
          >
            <IconSettings :size="20" />
          </button>
        </Tooltip>
      </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.user-dock {
  display: grid;
  grid-template-columns: var(--ui-hub-rail-w) minmax(0, 1fr);
  align-items: center;
  min-height: var(--ui-user-dock-h, 56px);
  height: var(--ui-user-dock-h, 56px);
  max-height: var(--ui-user-dock-h, 56px);
  padding: 6px 0;
  background: #0d1428;
  background-image: none;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  transition: background 280ms ease, border-color 280ms ease, box-shadow 280ms ease;
  overflow: hidden;
}

.user-dock.voice-active {
  background:
    linear-gradient(180deg, rgba(34, 211, 238, 0.08) 0%, rgba(13, 20, 40, 0.96) 42%),
    #0d1428;
  border-top-color: rgba(34, 211, 238, 0.28);
  box-shadow: inset 0 1px 0 rgba(34, 211, 238, 0.2);
}

.user-dock.voice-join-pulse {
  animation: user-dock-join-pulse 520ms ease-out 1;
}

.user-card {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  transition: transform 220ms ease, filter 220ms ease;
  min-width: 0;
  width: 100%;
}

.user-main {
  display: flex;
  min-width: 0;
  overflow: hidden;
  padding: 0 10px 0 12px;
  width: 100%;
}

.avatar-rail-btn {
  width: 100%;
  height: 100%;
  min-height: 40px;
  border: 0;
  background: transparent;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: background 0.18s ease;
}

.avatar-rail-btn:hover {
  background: rgba(255, 255, 255, 0.04);
}

.avatar-rail-btn:focus-visible {
  outline: 2px solid rgba(34, 211, 238, 0.8);
  outline-offset: -2px;
}

.rail-avatar {
  transition: transform 0.18s ease;
}

.avatar-rail-btn:hover .rail-avatar {
  transform: translateY(-1px);
}

.user-card.in-voice {
  transform: translateY(-1px);
  filter: saturate(1.06);
}

.user-avatar-wrap {
  position: relative;
  flex-shrink: 0;
}

.user-presence {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #34d399;
  border: 2px solid #070a18;
  transition: transform 220ms ease, background 220ms ease, box-shadow 220ms ease;
}

.user-presence.offline {
  background: #64748b;
}

.user-presence.in-voice {
  transform: scale(1.08);
  box-shadow: 0 0 8px rgba(34, 211, 238, 0.85);
}

.user-info {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.username {
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status {
  color: #34d399;
  font-size: 10px;
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dock-status-enter-active,
.dock-status-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.dock-status-enter-from,
.dock-status-leave-to {
  opacity: 0;
  transform: translateY(3px);
}

.dock-status-enter-to,
.dock-status-leave-from {
  opacity: 1;
  transform: translateY(0);
}

.controls {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.control-btn {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #4a5568;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: background 0.18s ease, color 0.18s ease, transform 0.16s ease, box-shadow 0.18s ease;
}

.control-btn svg {
  width: 16px;
  height: 16px;
}

.control-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.05);
  color: #ffffff;
  transform: translateY(-1px);
}

.user-dock.voice-active .control-btn:hover:not(:disabled) {
  box-shadow: 0 6px 14px rgba(34, 211, 238, 0.14);
}

.control-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.control-btn.muted {
  color: #f87171;
  background: rgba(248, 113, 113, 0.15);
}


@keyframes user-dock-join-pulse {
  0% {
    box-shadow: inset 0 1px 0 rgba(34, 211, 238, 0), 0 -12px 22px rgba(34, 211, 238, 0);
  }
  55% {
    box-shadow: inset 0 1px 0 rgba(34, 211, 238, 0.24), 0 -12px 22px rgba(34, 211, 238, 0.18);
  }
  100% {
    box-shadow: inset 0 1px 0 rgba(34, 211, 238, 0.2), 0 -8px 16px rgba(34, 211, 238, 0.1);
  }
}
</style>
