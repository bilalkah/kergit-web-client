<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { Track } from 'livekit-client'
import type { Participant, TrackPublication } from 'livekit-client'
import { setParticipantVolume } from '@/src/services/webrtc/livekit'
import { useAppStore } from '~/stores/app'
import { TileMode, VOLUME } from '@/src/types/voice'
import {
  IconCamera,
  IconCameraOff,
  IconDots,
  IconScreenShare,
  IconScreenShareOff,
} from '~/components/icons/VoiceIcons'
import Tooltip from '~/components/ui/Tooltip.vue'
import VolumeSlider from './VolumeSlider.vue'

const props = defineProps<{
  displayName: string
  userId: string
  mode: TileMode
  participant: Participant
  publication: TrackPublication | null
  screenUnsubscribed: boolean
  cameraAvailable: boolean
  cameraUnsubscribed: boolean
}>()

const emit = defineEmits<{
  'toggle-screen-subscription': []
  'toggle-camera-subscription': []
}>()
const app = useAppStore()
const menuOpen = ref(false)
const menuEl = ref<HTMLElement | null>(null)

const participantVolume = ref<number>(VOLUME.DEFAULT)

function initVolume() {
  if (props.userId) {
    participantVolume.value = app.getUserVolumeOverride(props.userId)
  }
}

watch(() => menuOpen.value, (open) => {
  if (open) initVolume()
})

function onVolumeUpdate(value: number) {
  participantVolume.value = value
  if (props.mode === TileMode.ScreenShare) {
    const p = props.participant as any
    if (p?.setVolume) {
      p.setVolume(value / 100, Track.Source.ScreenShareAudio)
    }
  } else {
    if (props.userId) {
      setParticipantVolume(props.userId, value)
    }
  }
}

const canToggleScreenShare = computed(() => {
  return props.mode === TileMode.ScreenShare && !!props.publication
})

const canToggleCamera = computed(() => {
  return props.mode !== TileMode.ScreenShare && props.cameraAvailable
})

function toggleScreenShareSubscription() {
  if (!props.publication) return
  emit('toggle-screen-subscription')
}

function toggleCameraSubscription() {
  if (!props.cameraAvailable) return
  emit('toggle-camera-subscription')
}

function openMenu(event: MouseEvent) {
  event.stopPropagation()
  menuOpen.value = !menuOpen.value
}

function onClickOutside(event: MouseEvent) {
  if (!menuOpen.value) return
  if (menuEl.value && menuEl.value.contains(event.target as Node)) return
  menuOpen.value = false
}

onMounted(() => {
  document.addEventListener('mousedown', onClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onClickOutside)
})
</script>

<template>
  <div ref="menuEl" class="tile-menu-anchor">
    <Tooltip content="Ayarlar">
      <button class="tile-menu-btn"
        :class="{ 'is-visible': menuOpen || screenUnsubscribed || (cameraAvailable && cameraUnsubscribed) }"
        @click="openMenu">

        <IconDots />
      </button>
    </Tooltip>

    <Transition name="menu-fade">
      <div v-if="menuOpen" class="tile-popover" @click.stop>
        <div class="popover-header">{{ displayName }}</div>

        <VolumeSlider :model-value="participantVolume"
          :label="mode === TileMode.ScreenShare ? 'Ekran Sesi' : 'Ses Seviyesi'" @update:model-value="onVolumeUpdate" />

        <button v-if="canToggleScreenShare" class="popover-action" @click="toggleScreenShareSubscription">
          <component :is="screenUnsubscribed ? IconScreenShareOff : IconScreenShare" :size="14" />
          <span>{{ screenUnsubscribed ? 'Ekranı izle' : 'Ekranı kapat' }}</span>
        </button>

        <button v-if="canToggleCamera" class="popover-action" @click="toggleCameraSubscription">
          <component :is="cameraUnsubscribed ? IconCameraOff : IconCamera" :size="14" />
          <span>{{ cameraUnsubscribed ? 'Kamerayı izle' : 'Kamerayı kapat' }}</span>
        </button>


      </div>
    </Transition>
  </div>
</template>

<style scoped>
.tile-menu-anchor {
  position: absolute;
  right: 8px;
  bottom: 8px;
  z-index: 4;
}

.tile-menu-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: none;
  background: rgba(0, 0, 0, 0.5);
  color: #94a3b8;
  cursor: pointer;
  display: grid;
  place-items: center;
  opacity: 0;
  transition: opacity 150ms ease, background 150ms ease, color 150ms ease;
}

.tile-menu-btn:hover {
  background: rgba(0, 0, 0, 0.7);
  color: #f8fafc;
}

.tile-menu-btn.is-visible {
  opacity: 1;
}

.tile-popover {
  position: absolute;
  right: 0;
  bottom: calc(100% + 6px);
  width: 220px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(13, 16, 32, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(12px);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.popover-header {
  font-size: 12px;
  font-weight: 700;
  color: #e2e8f0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.popover-action {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: #d1d9e8;
  font-size: 12px;
  cursor: pointer;
  transition: background 150ms ease;
}

.popover-action:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
}

.menu-fade-enter-active,
.menu-fade-leave-active {
  transition: opacity 120ms ease, transform 120ms ease;
}

.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
