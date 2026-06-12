<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import Avatar from '~/components/ui/Avatar.vue'
import Tooltip from '~/components/ui/Tooltip.vue'
import { useAppStore } from '~/stores/app'
import { userAvatarUrl } from '@/src/utils/avatar'
import { IconVolumeBoosted, IconVolumeLow, IconVolumeMuted, IconMicMuted, IconHeadphonesOff } from '~/components/icons/VoiceIcons'

interface VoiceParticipantView {
  userId: string
  displayName: string
  role?: string
  avatarSeed?: string
  speaking?: boolean
  muted?: boolean
  deafened?: boolean
}

const props = defineProps<{
  participant: VoiceParticipantView
}>()

const emit = defineEmits<{
  'show-profile': [{ userId: string; x: number; y: number }]
  'show-voice-controls': [{ userId: string; x: number; y: number }]
}>()

const app = useAppStore()
const TOUCH_LONG_PRESS_MS = 450

let longPressTimer: number | null = null
let suppressNextClick = false
let suppressContextMenuUntilMs = 0
let suppressNextClickTimer: number | null = null

const voiceState = computed(() => {
  const state = app.voiceStatesByUser[props.participant.userId]
  if (state) return state
  return {
    muted: props.participant.muted === true,
    deafened: props.participant.deafened === true,
  }
})

const volumeOverride = computed(() => app.getUserVolumeOverride(props.participant.userId))

const volumeIndicator = computed<'muted' | 'low' | 'boosted' | null>(() => {
  if (volumeOverride.value === 100) return null
  if (volumeOverride.value <= 0) return 'muted'
  if (volumeOverride.value > 100) return 'boosted'
  return 'low'
})

function emitShowProfile(x: number, y: number) {
  emit('show-profile', {
    userId: props.participant.userId,
    x,
    y,
  })
}

function emitShowVoiceControls(x: number, y: number) {
  emit('show-voice-controls', {
    userId: props.participant.userId,
    x,
    y,
  })
}

function clearLongPressTimer() {
  if (longPressTimer === null) return
  window.clearTimeout(longPressTimer)
  longPressTimer = null
}

function scheduleSuppressNextClickReset() {
  if (suppressNextClickTimer !== null) {
    window.clearTimeout(suppressNextClickTimer)
  }
  suppressNextClickTimer = window.setTimeout(() => {
    suppressNextClick = false
    suppressNextClickTimer = null
  }, 700)
}

function onClick(event: MouseEvent) {
  if (suppressNextClick) {
    suppressNextClick = false
    event.preventDefault()
    event.stopPropagation()
    return
  }
  emitShowProfile(event.clientX, event.clientY)
}

function onContextMenu(event: MouseEvent) {
  event.preventDefault()
  if (Date.now() < suppressContextMenuUntilMs) return
  emitShowVoiceControls(event.clientX, event.clientY)
}

function onTouchStart(event: TouchEvent) {
  const touch = event.touches[0]
  if (!touch) return
  const startX = touch.clientX
  const startY = touch.clientY
  clearLongPressTimer()
  longPressTimer = window.setTimeout(() => {
    suppressNextClick = true
    suppressContextMenuUntilMs = Date.now() + 700
    scheduleSuppressNextClickReset()
    emitShowVoiceControls(startX, startY)
    clearLongPressTimer()
  }, TOUCH_LONG_PRESS_MS)
}

function onTouchEnd() {
  clearLongPressTimer()
}

function onTouchMove() {
  clearLongPressTimer()
}

function onTouchCancel() {
  clearLongPressTimer()
}

onBeforeUnmount(() => {
  clearLongPressTimer()
  if (suppressNextClickTimer !== null) {
    window.clearTimeout(suppressNextClickTimer)
    suppressNextClickTimer = null
  }
})
</script>

<template>
  <button
    class="ui-voice-participant"
    type="button"
    @click="onClick"
    @contextmenu="onContextMenu"
    @touchstart.passive="onTouchStart"
    @touchend="onTouchEnd"
    @touchmove="onTouchMove"
    @touchcancel="onTouchCancel"
  >
    <Avatar
      class="ui-voice-avatar"
      :src="userAvatarUrl(participant.avatarSeed)"
      :alt="participant.displayName"
      :size="18"
      :speaking="participant.speaking === true"
    />
    <span class="ui-voice-name">{{ participant.displayName }}</span>

    <div v-if="volumeIndicator || voiceState.muted || voiceState.deafened" class="ui-voice-state-icons">
      <Tooltip v-if="volumeIndicator" :content="`Kullanıcı ses seviyesi ${volumeOverride}%`">
        <span
          class="ui-voice-state-icon volume"
          :class="volumeIndicator"
          :aria-label="`Kullanıcı ses seviyesi ${volumeOverride}%`"
        >
          <IconVolumeBoosted v-if="volumeIndicator === 'boosted'" :size="14" />
          <IconVolumeLow v-else-if="volumeIndicator === 'low'" :size="14" />
          <IconVolumeMuted v-else :size="14" />
        </span>
      </Tooltip>

      <Tooltip v-if="voiceState.muted" content="Mikrofon kapalı">
        <span
          class="ui-voice-state-icon"
          :class="{ muted: voiceState.muted }"
          aria-label="Mikrofon kapalı"
        >
          <IconMicMuted :size="14" />
        </span>
      </Tooltip>

      <Tooltip v-if="voiceState.deafened" content="Kulaklık kapalı">
        <span
          class="ui-voice-state-icon"
          :class="{ muted: voiceState.deafened }"
          aria-label="Kulaklık kapalı"
        >
          <IconHeadphonesOff :size="14" />
        </span>
      </Tooltip>
    </div>
  </button>
</template>

<style scoped>
.ui-voice-participant {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 7px;
  width: 100%;
  min-height: 24px;
  padding: 3px 6px;
  border: 0;
  background: transparent;
  border-radius: 8px;
  color: rgba(172, 188, 221, 0.86);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.ui-voice-avatar {
  flex-shrink: 0;
  border: 1px solid rgba(93, 201, 255, 0.42);
  box-shadow: 0 0 0 2px rgba(8, 14, 34, 0.9);
}

.ui-voice-name {
  min-width: 0;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.ui-voice-state-icons {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.ui-voice-state-icon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: rgba(172, 188, 221, 0.72);
}

.ui-voice-state-icon svg {
  width: 14px;
  height: 14px;
}

.ui-voice-state-icon.muted {
  color: #f87171;
}


.ui-voice-state-icon.volume {
  color: rgba(172, 188, 221, 0.82);
}

.ui-voice-state-icon.volume.low {
  color: #f59e0b;
}

.ui-voice-state-icon.volume.boosted {
  color: #a855f7;
}

.ui-voice-state-icon.volume.muted {
  color: #94a3b8;
}

.ui-voice-state-icon.volume.muted::after {
  display: none;
}
</style>
