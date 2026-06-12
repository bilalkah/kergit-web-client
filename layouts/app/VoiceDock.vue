<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAppStore, ChannelType } from '~/stores/app'
import { useWebSocket, VoiceTransitionKind } from '~/composables/useWebSocket'
import VoiceConnectionCard from '~/components/ui/VoiceConnectionCard.vue'
import { IconClose } from '~/components/icons/Common'
import { IconHeadphones } from '~/components/icons/VoiceIcons'

defineOptions({
  inheritAttrs: false,
})

const app = useAppStore()
const socket = useWebSocket()
const route = useRoute()
const attrs = useAttrs()

const isHomeRoute = computed(() => route.path === '/app')

function goToVoiceChannel() {
  if (!app.activeVoiceHubId) return
  const channels = app.channelsByHub[app.activeVoiceHubId] ?? []
  const firstText = channels.find(ch => ch.type === ChannelType.Text)
  const targetChannel = firstText?.id ?? channels[0]?.id
  if (!targetChannel) return
  app.showVoiceGrid()
  navigateTo(`/channels/${app.activeVoiceHubId}/${targetChannel}`)
}

const hasActiveVoice = computed(() => app.hasLocalActiveVoice)

const voiceChannel = computed(() => {
  if (!app.activeVoiceHubId || !app.activeVoiceChannelId) return null
  const list = app.channelsByHub[app.activeVoiceHubId] ?? []
  return list.find(channel => channel.id === app.activeVoiceChannelId) ?? null
})

const voiceHubName = computed(() => {
  if (!app.activeVoiceHubId) return ''
  const hub = app.hubs.find(item => item.id === app.activeVoiceHubId)
  return hub?.name ?? ''
})

const pingLabel = computed(() => {
  if (app.voiceLatencyMs === null || app.voiceLatencyMs === undefined) return '--'
  return `${app.voiceLatencyMs}ms`
})

const pingColor = computed(() => {
  if (app.voiceError) return '#f87171'
  if (app.voiceLatencyMs === null || app.voiceLatencyMs === undefined) return '#22d3ee'
  if (app.voiceLatencyMs <= 15) return '#22d3ee'
  if (app.voiceLatencyMs <= 22) return '#a3e635'
  return '#fbbf24'
})

const isVoiceConnectingDisplay = computed(() => {
  if (app.voiceError) return false
  if (app.voiceConnecting) return true
  if (!app.voiceConnectedByThisSession) return true
  return app.voiceLatencyMs === null || app.voiceLatencyMs === undefined
})

const voiceStatusText = computed(() => {
  if (app.voiceError) return app.voiceError
  return isVoiceConnectingDisplay.value ? 'Ses Bağlanıyor' : 'Ses Bağlandı'
})

enum TakeoverReason {
  Switch = 'switch',
  Takeover = 'takeover',
}

const takeoverDialogOpen = ref(false)
const takeoverReason = computed(() => (app.pendingVoiceTakeover?.reason as TakeoverReason) ?? TakeoverReason.Takeover)
const takeoverDialogTitle = computed(() =>
  takeoverReason.value === TakeoverReason.Switch ? 'Ses oturumu değiştirilsin mi?' : 'Ses oturumu devralınsın mı?'
)
const takeoverDialogBody = computed(() =>
  takeoverReason.value === TakeoverReason.Switch
    ? 'Başka bir kanalda zaten ses bağlantın var. Geçiş yapılsın mı?'
    : 'Ses başka bir oturumda aktif. Devralmak istiyor musun?'
)
const takeoverConfirmLabel = computed(() =>
  takeoverReason.value === TakeoverReason.Switch ? 'Geçiş yap' : 'Devral'
)

watch(
  () => app.pendingVoiceTakeover,
  value => {
    takeoverDialogOpen.value = value !== null
  },
  { immediate: true }
)

function leaveVoice() {
  if (!hasActiveVoice.value || !app.activeVoiceHubId || !app.activeVoiceChannelId) return
  void socket.requestVoiceTransition({
    kind: VoiceTransitionKind.Leave,
    hubId: app.activeVoiceHubId,
    channelId: app.activeVoiceChannelId,
    source: 'voice_dock_leave',
  })
}

async function confirmVoiceTakeover() {
  const pending = app.pendingVoiceTakeover
  if (!pending) return
  await socket.requestVoiceTransition({
    kind: VoiceTransitionKind.Takeover,
    hubId: pending.hubId,
    channelId: pending.channelId,
    force: true,
    source: 'voice_dock_takeover',
  })
}

function cancelVoiceTakeover() {
  socket.cancelVoiceTakeover()
}
</script>

<template>
  <div
    class="voice-dock"
    v-bind="attrs"
    role="region"
    aria-label="Ses kontrolleri"
  >
    <Transition name="slide-voice">
      <div v-if="hasActiveVoice && isHomeRoute" class="voice-dock-compact" @click="goToVoiceChannel">
        <button class="voice-compact-btn" type="button" aria-label="Ses kanalına git">
          <IconHeadphones :size="22" />
        </button>
      </div>
      <VoiceConnectionCard
        v-else-if="hasActiveVoice"
        :status-text="voiceStatusText"
        :latency-text="pingLabel"
        :latency-ms="app.voiceLatencyMs"
        :latency-color="pingColor"
        :channel-name="voiceChannel?.name ?? 'ses-kanalı'"
        :hub-name="voiceHubName"
        :connecting="isVoiceConnectingDisplay"
        :error="!!app.voiceError"
        @leave="leaveVoice"
      />
    </Transition>
  </div>

  <Teleport to="body">
    <div v-if="takeoverDialogOpen && app.pendingVoiceTakeover" class="hub-overlay">
      <div class="hub-surface" @click="cancelVoiceTakeover"></div>
      <div class="hub-card" role="dialog" aria-modal="true" aria-labelledby="voice-takeover-title">
        <div class="hub-header-row">
          <div>
            <div id="voice-takeover-title" class="hub-title">{{ takeoverDialogTitle }}</div>
            <div class="hub-sub">{{ takeoverDialogBody }}</div>
          </div>
          <button class="hub-close" @click="cancelVoiceTakeover" aria-label="Kapat">
            <IconClose :size="14" />
          </button>
        </div>
        <div class="hub-content">
          <div class="hub-actions">
            <button class="hub-btn ghost" @click="cancelVoiceTakeover">Vazgeç</button>
            <button class="hub-btn primary" @click="confirmVoiceTakeover">{{ takeoverConfirmLabel }}</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.voice-dock {
  width: 100%;
  padding: 0;
}

.voice-dock-compact {
  display: grid;
  place-items: center;
  padding: 8px 0;
  cursor: pointer;
}

.voice-compact-btn {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  border: 1px solid rgba(34, 211, 238, 0.35);
  background: rgba(34, 211, 238, 0.1);
  color: #22d3ee;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
  box-shadow: 0 0 12px rgba(34, 211, 238, 0.15);
}

.voice-compact-btn:hover {
  background: rgba(34, 211, 238, 0.18);
  border-color: rgba(34, 211, 238, 0.5);
  box-shadow: 0 0 18px rgba(34, 211, 238, 0.25);
}

.slide-voice-enter-active,
.slide-voice-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease, max-height 0.2s ease;
  overflow: hidden;
}

.slide-voice-enter-from,
.slide-voice-leave-to {
  opacity: 0;
  transform: translateY(6px);
  max-height: 0;
}

.slide-voice-enter-to,
.slide-voice-leave-from {
  opacity: 1;
  transform: translateY(0);
  max-height: 120px;
}

/* Hub modal styles */
.hub-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hub-surface {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
}

.hub-card {
  position: relative;
  z-index: 1;
  width: min(380px, 92vw);
  border-radius: 16px;
  background: #0d1020;
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 0 22px 46px rgba(2, 6, 23, 0.45);
}

.hub-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 20px 20px 12px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.hub-close {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #8892a4;
  cursor: pointer;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  transition: background 0.15s ease, color 0.15s ease;
}

.hub-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #f2f7ff;
}

.hub-title {
  font-family: 'Inter', sans-serif;
  font-weight: 700;
  font-size: 1.15rem;
  color: #f2f7ff;
}

.hub-sub {
  font-size: 14px;
  color: #8892a4;
  margin-top: 4px;
  line-height: 1.5;
}

.hub-content {
  padding: 16px 20px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hub-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.hub-btn {
  border: none;
  border-radius: 12px;
  padding: 10px 18px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: 'Inter', sans-serif;
}

.hub-btn.ghost {
  color: #d7deed;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.hub-btn.ghost:hover {
  background: rgba(255, 255, 255, 0.06);
}

.hub-btn.primary {
  color: #fff;
  background: linear-gradient(135deg, #6d28d9, #7c3aed);
  box-shadow: 0 4px 14px rgba(109, 40, 217, 0.35);
}

.hub-btn.primary:hover {
  box-shadow: 0 6px 20px rgba(109, 40, 217, 0.45);
}

</style>
