<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { RoomEvent, Track } from 'livekit-client'
import type { Participant, RemoteParticipant } from 'livekit-client'
import {
  getRoom,
  isRemoteCameraAllowed,
  isScreenShareAudioAllowed,
  setMicrophoneMuted,
  startAudioWithUserGesture,
} from '@/src/services/webrtc/livekit'
import { useAppStore } from '~/stores/app'
import { useWebSocket, VoiceTransitionKind } from '~/composables/useWebSocket'
import { TileMode, VOICE_GRID } from '@/src/types/voice'
import {
  IconMic, IconMicMuted,
  IconCamera, IconCameraOff,
  IconScreenShare, IconScreenShareOff,
  IconPhoneOff,
  IconFullscreen, IconFullscreenExit,
} from '~/components/icons/VoiceIcons'
import Tooltip from '~/components/ui/Tooltip.vue'
import VoiceGridTile from './VoiceGridTile.vue'

const app = useAppStore()
const socket = useWebSocket()

const gridRoot = ref<HTMLElement | null>(null)
const isFullscreen = ref(false)
const participants = ref<Participant[]>([])
const page = ref(0)
const trackRevision = ref(0)

// Track which remote screen shares the user has subscribed to (survives tile remounts)
const screenSubscribed = ref<Record<string, boolean>>({})

function isScreenSubscribed(identity: string) {
  return screenSubscribed.value[identity] === true
}

function setScreenSubscribed(identity: string, subscribed: boolean) {
  const normalizedIdentity = identity?.trim() ?? ''
  if (!normalizedIdentity) return
  screenSubscribed.value[normalizedIdentity] = subscribed
}

function clearScreenSubscribed(identity: string) {
  const normalizedIdentity = identity?.trim() ?? ''
  if (!normalizedIdentity) return
  if (!(normalizedIdentity in screenSubscribed.value)) return
  const next = { ...screenSubscribed.value }
  delete next[normalizedIdentity]
  screenSubscribed.value = next
}

// Track which remote cameras the user has subscribed to (survives tile remounts)
const cameraSubscribed = ref<Record<string, boolean>>({})

function isCameraSubscribed(identity: string) {
  return cameraSubscribed.value[identity] === true
}

function setCameraSubscribed(identity: string, subscribed: boolean) {
  const normalizedIdentity = identity?.trim() ?? ''
  if (!normalizedIdentity) return

  if (subscribed) {
    cameraSubscribed.value = {
      ...cameraSubscribed.value,
      [normalizedIdentity]: true,
    }
    return
  }

  clearCameraSubscribed(normalizedIdentity)
}

function clearCameraSubscribed(identity: string) {
  const normalizedIdentity = identity?.trim() ?? ''
  if (!normalizedIdentity) return
  if (!(normalizedIdentity in cameraSubscribed.value)) return
  const next = { ...cameraSubscribed.value }
  delete next[normalizedIdentity]
  cameraSubscribed.value = next
}

// Spotlight / focus mode
const focusedKey = ref<string | null>(null)
const stripHidden = ref(false)

// Auto-hide controls in spotlight mode
const mouseIdle = ref(false)
let mouseIdleTimer: ReturnType<typeof setTimeout> | null = null

function resetMouseIdle() {
  mouseIdle.value = false
  if (mouseIdleTimer) clearTimeout(mouseIdleTimer)
  mouseIdleTimer = setTimeout(() => {
    mouseIdle.value = true
  }, VOICE_GRID.MOUSE_IDLE_MS)
}

function onMouseMove() {
  if (isSpotlight.value) {
    resetMouseIdle()
  }
}

const controlsHidden = computed(() => mouseIdle.value && isSpotlight.value)

type GridEntry = {
  key: string
  type: TileMode
  participant: any
  isLocal: boolean
}

const gridEntries = computed(() => {
  const entries: GridEntry[] = []
  for (const p of participants.value) {
    const isLocal = p === participants.value[0]
    entries.push({
      key: `p-${p.identity}`,
      type: TileMode.Participant,
      participant: p,
      isLocal,
    })
    const screenPub = p.getTrackPublication(Track.Source.ScreenShare)
    if (screenPub && !screenPub.isMuted) {
      entries.push({
        key: `s-${p.identity}`,
        type: TileMode.ScreenShare,
        participant: p,
        isLocal,
      })
    }
  }
  return entries
})

const isSpotlight = computed(() => focusedKey.value !== null)

const effectiveFocusedKey = computed(() => {
  if (focusedKey.value && gridEntries.value.find(e => e.key === focusedKey.value)) {
    return focusedKey.value
  }
  return null
})

const focusedEntry = computed(() => {
  if (!effectiveFocusedKey.value) return null
  return gridEntries.value.find(e => e.key === effectiveFocusedKey.value) ?? null
})

const stripEntries = computed(() => {
  if (!isSpotlight.value) return []
  return gridEntries.value.filter(e => e.key !== effectiveFocusedKey.value)
})

const totalPages = computed(() => {
  return Math.max(1, Math.ceil(gridEntries.value.length / VOICE_GRID.PAGE_SIZE))
})

const visibleEntries = computed(() => {
  const start = page.value * VOICE_GRID.PAGE_SIZE
  return gridEntries.value.slice(start, start + VOICE_GRID.PAGE_SIZE)
})

const gridClass = computed(() => {
  const count = visibleEntries.value.length
  if (count <= 1) return 'layout-1'
  if (count === 2) return 'layout-2'
  if (count <= 4) return 'layout-4'
  if (count <= 6) return 'layout-6'
  return 'layout-9'
})

function nextPage() {
  if (page.value < totalPages.value - 1) page.value++
}

function prevPage() {
  if (page.value > 0) page.value--
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null

function scheduleRefresh() {
  if (refreshTimer) return
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    refreshParticipants()
  }, VOICE_GRID.REFRESH_DEBOUNCE_MS)
}

function refreshParticipants() {
  const room = getRoom()
  if (!room) {
    participants.value = []
    screenSubscribed.value = {}
    cameraSubscribed.value = {}
    page.value = 0
    return
  }
  const all: Participant[] = [room.localParticipant]
  for (const p of room.remoteParticipants.values()) {
    all.push(p)
  }

  const nextScreenSubscribed: Record<string, boolean> = {}
  const nextCameraSubscribed: Record<string, boolean> = {}
  for (const participant of all) {
    if ((participant as any)?.isLocal) continue
    const identity = participant.identity?.trim() ?? ''
    if (!identity) continue
    const screenVideoPub = participant.getTrackPublication(Track.Source.ScreenShare)
    if (!screenVideoPub || screenVideoPub.isMuted) continue
    const trackSids = [
      screenVideoPub.trackSid,
      participant.getTrackPublication(Track.Source.ScreenShareAudio)?.trackSid,
    ].filter((sid): sid is string => typeof sid === 'string' && sid.trim().length > 0)
    if (isScreenShareAudioAllowed(identity, trackSids)) {
      nextScreenSubscribed[identity] = true
    }

    const cameraPub = participant.getTrackPublication(Track.Source.Camera)
    if (cameraPub && !cameraPub.isMuted) {
      const cameraTrackSids = [cameraPub.trackSid]
        .filter((sid): sid is string => typeof sid === 'string' && sid.trim().length > 0)

      if (isRemoteCameraAllowed(identity, cameraTrackSids)) {
        nextCameraSubscribed[identity] = true
      }
    }
  }

  participants.value = all
  screenSubscribed.value = nextScreenSubscribed
  cameraSubscribed.value = nextCameraSubscribed
  trackRevision.value++

  const maxPage = Math.max(0, Math.ceil(all.length / VOICE_GRID.PAGE_SIZE) - 1)
  if (page.value > maxPage) {
    page.value = maxPage
  }

  if (focusedKey.value && !gridEntries.value.find(e => e.key === focusedKey.value)) {
    focusedKey.value = null
  }
}

function onTileClick(entry: GridEntry) {
  if (isSpotlight.value && effectiveFocusedKey.value === entry.key) {
    focusedKey.value = null
  } else {
    focusedKey.value = entry.key
  }
}

function onStripTileClick(entry: GridEntry) {
  focusedKey.value = entry.key
}

function toggleStripHidden() {
  stripHidden.value = !stripHidden.value
}

async function toggleMute() {
  const next = !app.voiceMuted
  app.setVoiceMuted(next)
  if (app.activeVoiceHubId && app.activeVoiceChannelId) {
    void socket.sendVoiceActivity(
      app.activeVoiceHubId,
      app.activeVoiceChannelId,
      next,
      app.voiceDeafened
    )
  }
  await setMicrophoneMuted(next)
}

async function unlockAudioPlayback() {
  await startAudioWithUserGesture()
}

function onDisconnect() {
  if (app.activeVoiceHubId && app.activeVoiceChannelId) {
    void socket.requestVoiceTransition({
      kind: VoiceTransitionKind.Leave,
      hubId: app.activeVoiceHubId,
      channelId: app.activeVoiceChannelId,
      source: 'voice_grid_disconnect',
    })
  }
}

function toggleFullscreen() {
  if (!gridRoot.value) return
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => { })
  } else {
    gridRoot.value.requestFullscreen().catch(() => { })
  }
}

function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
}

watch(isSpotlight, (val) => {
  if (!val) {
    stripHidden.value = false
    mouseIdle.value = false
    if (mouseIdleTimer) clearTimeout(mouseIdleTimer)
  } else {
    resetMouseIdle()
  }
})

let cleanupEvents: (() => void) | null = null

onMounted(() => {
  document.addEventListener('fullscreenchange', onFullscreenChange)
  refreshParticipants()

  const room = getRoom()
  if (!room) return

  const onParticipantConnected = (_p: RemoteParticipant) => scheduleRefresh()
  const onParticipantDisconnected = (participant: RemoteParticipant) => {
    clearScreenSubscribed(participant.identity)
    clearCameraSubscribed(participant.identity)
    scheduleRefresh()
  }
  const onTrackSubscribed = () => scheduleRefresh()
  const onTrackUnsubscribed = () => scheduleRefresh()
  const onTrackPublished = (
    publication: { source?: Track.Source } | undefined,
    participant: RemoteParticipant,
  ) => {
    if (publication?.source === Track.Source.ScreenShare) {
      clearScreenSubscribed(participant.identity)
    }

    if (publication?.source === Track.Source.Camera) {
      clearCameraSubscribed(participant.identity)
    }
    scheduleRefresh()
  }
  const onTrackUnpublished = (
    publication: { source?: Track.Source } | undefined,
    participant: RemoteParticipant,
  ) => {
    if (publication?.source === Track.Source.ScreenShare) {
      clearScreenSubscribed(participant.identity)
    }

    if (publication?.source === Track.Source.Camera) {
      clearCameraSubscribed(participant.identity)
    }
    scheduleRefresh()
  }
  const onTrackMuted = () => scheduleRefresh()
  const onTrackUnmuted = () => scheduleRefresh()
  const onLocalTrackPublished = () => scheduleRefresh()
  const onLocalTrackUnpublished = () => scheduleRefresh()

  room.on(RoomEvent.ParticipantConnected, onParticipantConnected)
  room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected)
  room.on(RoomEvent.TrackSubscribed, onTrackSubscribed)
  room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
  room.on(RoomEvent.TrackPublished, onTrackPublished)
  room.on(RoomEvent.TrackUnpublished, onTrackUnpublished)
  room.on(RoomEvent.TrackMuted, onTrackMuted)
  room.on(RoomEvent.TrackUnmuted, onTrackUnmuted)
  room.on(RoomEvent.LocalTrackPublished, onLocalTrackPublished)
  room.on(RoomEvent.LocalTrackUnpublished, onLocalTrackUnpublished)

  cleanupEvents = () => {
    room.off(RoomEvent.ParticipantConnected, onParticipantConnected)
    room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected)
    room.off(RoomEvent.TrackSubscribed, onTrackSubscribed)
    room.off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
    room.off(RoomEvent.TrackPublished, onTrackPublished)
    room.off(RoomEvent.TrackUnpublished, onTrackUnpublished)
    room.off(RoomEvent.TrackMuted, onTrackMuted)
    room.off(RoomEvent.TrackUnmuted, onTrackUnmuted)
    room.off(RoomEvent.LocalTrackPublished, onLocalTrackPublished)
    room.off(RoomEvent.LocalTrackUnpublished, onLocalTrackUnpublished)
  }
})

onBeforeUnmount(() => {
  cleanupEvents?.()
  if (refreshTimer) clearTimeout(refreshTimer)
  if (mouseIdleTimer) clearTimeout(mouseIdleTimer)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
})
</script>

<template>
  <div ref="gridRoot" class="voice-grid-root" @mousemove="onMouseMove">
    <div class="voice-grid-body">
      <!-- Spotlight mode -->
      <div v-if="isSpotlight && focusedEntry" class="voice-spotlight">
        <div class="spotlight-main">
          <VoiceGridTile :key="focusedEntry.key" :participant="focusedEntry.participant"
            :is-local="focusedEntry.isLocal" :mode="focusedEntry.type" :track-revision="trackRevision"
            :screen-subscribed="isScreenSubscribed(focusedEntry.participant.identity)"
            :camera-subscribed="isCameraSubscribed(focusedEntry.participant.identity)"
            @click="onTileClick(focusedEntry)"
            @screen-subscribe="(v: boolean) => setScreenSubscribed(focusedEntry.participant.identity, v)"
            @camera-subscribe="(v: boolean) => setCameraSubscribed(focusedEntry.participant.identity, v)" />
        </div>

        <div v-if="stripEntries.length > 0 && !stripHidden" class="spotlight-strip">
          <VoiceGridTile v-for="entry in stripEntries" :key="entry.key" :participant="entry.participant"
            :is-local="entry.isLocal" :mode="entry.type" :track-revision="trackRevision"
            :screen-subscribed="isScreenSubscribed(entry.participant.identity)"
            :camera-subscribed="isCameraSubscribed(entry.participant.identity)" @click="onStripTileClick(entry)"
            @screen-subscribe="(v: boolean) => setScreenSubscribed(entry.participant.identity, v)"
            @camera-subscribe="(v: boolean) => setCameraSubscribed(entry.participant.identity, v)" />
        </div>
      </div>

      <!-- Normal grid mode -->
      <div v-else class="voice-grid-wrap">
        <div class="voice-grid" :class="gridClass">
          <VoiceGridTile v-for="entry in visibleEntries" :key="entry.key" :participant="entry.participant"
            :is-local="entry.isLocal" :mode="entry.type" :track-revision="trackRevision"
            :screen-subscribed="isScreenSubscribed(entry.participant.identity)"
            :camera-subscribed="isCameraSubscribed(entry.participant.identity)" @click="onTileClick(entry)"
            @screen-subscribe="(v: boolean) => setScreenSubscribed(entry.participant.identity, v)"
            @camera-subscribe="(v: boolean) => setCameraSubscribed(entry.participant.identity, v)" />
        </div>
      </div>

      <div v-if="!isSpotlight && totalPages > 1" class="voice-pagination">
        <button class="page-btn" :disabled="page === 0" @click="prevPage">&lsaquo;</button>
        <span class="page-indicator">{{ page + 1 }} / {{ totalPages }}</span>
        <button class="page-btn" :disabled="page === totalPages - 1" @click="nextPage">&rsaquo;</button>
      </div>
    </div>

    <button v-if="isSpotlight" class="strip-toggle-btn" :class="{ 'controls-hidden': controlsHidden }"
      @click="toggleStripHidden">
      {{ stripHidden ? 'Üyeleri göster' : 'Üyeleri gizle' }}
    </button>

    <div class="voice-toolbar" :class="{ 'controls-hidden': controlsHidden }">
      <Tooltip v-if="app.voiceNeedsAudioUnlock" content="Sesi etkinleştir">
        <button class="toolbar-btn toolbar-btn-unlock" @click="unlockAudioPlayback">
          Enable Audio
        </button>
      </Tooltip>

      <Tooltip content="Mikrofon">
        <button class="toolbar-btn" :class="{ 'toolbar-btn-danger': app.voiceMuted }" @click="toggleMute">
          <component :is="app.voiceMuted ? IconMicMuted : IconMic" />
        </button>
      </Tooltip>

      <Tooltip content="Kamera">
        <button class="toolbar-btn" :class="{ 'toolbar-btn-active': app.localCameraEnabled }"
          @click="app.toggleCamera()">
          <component :is="app.localCameraEnabled ? IconCamera : IconCameraOff" />
        </button>
      </Tooltip>

      <Tooltip content="Ekran Paylaş">
        <button class="toolbar-btn" :class="{ 'toolbar-btn-active': app.localScreenShareEnabled }"
          @click="app.toggleScreenShare()">
          <component :is="app.localScreenShareEnabled ? IconScreenShareOff : IconScreenShare" />
        </button>
      </Tooltip>

      <Tooltip content="Bağlantıyı Kes">
        <button class="toolbar-btn toolbar-btn-disconnect" @click="onDisconnect">
          <IconPhoneOff />
        </button>
      </Tooltip>
    </div>

    <Tooltip :content="isFullscreen ? 'Tam ekrandan çık' : 'Tam ekran'" :class="{ 'controls-hidden': controlsHidden }">
      <button class="fullscreen-btn" @click="toggleFullscreen">
        <component :is="isFullscreen ? IconFullscreenExit : IconFullscreen" />
      </button>
    </Tooltip>
  </div>
</template>

<style scoped>
.voice-grid-root {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background:
    linear-gradient(180deg, rgba(4, 10, 34, 0.82), rgba(3, 7, 26, 0.94));
}

.voice-grid-root:fullscreen {
  background: #020617;
}

.voice-grid-body {
  position: relative;
  flex: 1;
  min-height: 0;
  padding: 18px 18px 92px;
}

.voice-grid-wrap {
  height: 100%;
  min-height: 0;
}

.voice-grid {
  display: grid;
  width: 100%;
  height: 100%;
  min-height: 0;
  gap: 12px;
}

/* ── Spotlight mode ── */
.voice-spotlight {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 8px;
}

.spotlight-main {
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.spotlight-strip {
  flex: 0 0 120px;
  display: flex;
  flex-direction: row;
  justify-content: center;
  gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 4px;
}

.spotlight-strip>* {
  flex: 0 0 180px;
  height: 100%;
}

/* ── Grid layouts (equal-sized tiles) ── */

.layout-1 {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
}

.layout-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: minmax(0, 1fr);
}

.layout-4 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
}

.layout-6 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
}

.layout-9 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-auto-rows: minmax(0, 1fr);
}

/* ── Pagination ── */
.voice-pagination {
  position: absolute;
  top: 18px;
  right: 18px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 3;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(9, 14, 30, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(10px);
}

.page-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: #dbe7ff;
  cursor: pointer;
}

.page-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.page-indicator {
  font-size: 12px;
  font-weight: 700;
  color: #c9d7ff;
  letter-spacing: 0.04em;
}

/* ── Strip toggle ── */
.strip-toggle-btn {
  position: absolute;
  left: 50%;
  bottom: 88px;
  transform: translateX(-50%);
  z-index: 4;
  padding: 6px 16px;
  border: none;
  border-radius: 999px;
  background: rgba(10, 14, 28, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(10px);
  color: #c9d7ff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 300ms ease, background 150ms ease;
  white-space: nowrap;
}

.strip-toggle-btn:hover {
  background: rgba(10, 14, 28, 0.95);
}

/* ── Toolbar ── */
.voice-toolbar {
  position: absolute;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  z-index: 5;
  display: flex;
  justify-content: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 999px;
  background: rgba(10, 14, 28, 0.84);
  border: 1px solid rgba(255, 255, 255, 0.07);
  backdrop-filter: blur(12px);
  transition: opacity 300ms ease;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: 999px;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: #94a3b8;
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease, transform 150ms ease;
}

.toolbar-btn:hover {
  background: rgba(255, 255, 255, 0.14);
  color: #f8fafc;
  transform: translateY(-1px);
}

.toolbar-btn-active {
  background: rgba(52, 211, 153, 0.2);
  color: var(--ui-accent-green, #34d399);
}

.toolbar-btn-active:hover {
  background: rgba(52, 211, 153, 0.28);
}

.toolbar-btn-danger {
  background: rgba(239, 68, 68, 0.25);
  color: #f87171;
}

.toolbar-btn-danger:hover {
  background: rgba(239, 68, 68, 0.35);
  color: #fca5a5;
}

.toolbar-btn-unlock {
  width: auto;
  min-width: 120px;
  padding: 0 16px;
  background: rgba(59, 130, 246, 0.24);
  color: #dbeafe;
  font-weight: 600;
}

.toolbar-btn-unlock:hover {
  background: rgba(59, 130, 246, 0.34);
  color: #eff6ff;
}

.toolbar-btn-disconnect {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.toolbar-btn-disconnect:hover {
  background: rgba(239, 68, 68, 0.35);
  color: #fca5a5;
}

/* ── Fullscreen button (bottom-right) ── */
.fullscreen-btn {
  position: absolute;
  right: 18px;
  bottom: 18px;
  z-index: 4;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: rgba(10, 14, 28, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #94a3b8;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: opacity 300ms ease, background 150ms ease, color 150ms ease;
}

.fullscreen-btn:hover {
  background: rgba(10, 14, 28, 0.95);
  color: #f8fafc;
}

/* ── Auto-hide controls ── */
.controls-hidden {
  opacity: 0;
  pointer-events: none;
}

/* ── Responsive ── */
@media (max-width: 1100px) {
  .voice-grid-body {
    padding: 14px 14px 86px;
  }

  .layout-6,
  .layout-9 {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }

  .spotlight-strip {
    flex: 0 0 100px;
  }

  .spotlight-strip>* {
    flex: 0 0 140px;
  }
}

@media (max-width: 720px) {
  .voice-grid {
    grid-template-columns: 1fr !important;
    grid-auto-rows: minmax(220px, 1fr);
  }

  .spotlight-strip {
    flex: 0 0 80px;
  }

  .spotlight-strip>* {
    flex: 0 0 120px;
  }

  .voice-pagination {
    top: 14px;
    right: 14px;
  }

  .voice-toolbar {
    bottom: 14px;
  }

  .fullscreen-btn {
    right: 14px;
    bottom: 14px;
  }
}
</style>
