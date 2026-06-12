<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import type { Participant } from 'livekit-client'
import { Track } from 'livekit-client'
import { useAppStore } from '~/stores/app'
import { userAvatarUrl } from '@/src/utils/avatar'
import { allowScreenShareAudio, disallowScreenShareAudio, allowRemoteCamera, disallowRemoteCamera } from '@/src/services/webrtc/livekit'
import { TileMode, VOICE_GRID } from '@/src/types/voice'
import { IconScreenShare } from '~/components/icons/VoiceIcons'
import VoiceTileOverlay from './VoiceTileOverlay.vue'
import VoiceTileMenu from './VoiceTileMenu.vue'

const props = withDefaults(defineProps<{
  participant: Participant
  isLocal: boolean
  mode: TileMode
  trackRevision: number
  screenSubscribed: boolean
  cameraSubscribed: boolean
}>(), {
  mode: TileMode.Participant,
  trackRevision: 0,
  screenSubscribed: false,
  cameraSubscribed: false,
})

const emit = defineEmits<{
  click: []
  'screen-subscribe': [subscribed: boolean]
  'camera-subscribe': [subscribed: boolean]
}>()

const app = useAppStore()
const videoEl = ref<HTMLVideoElement | null>(null)

const userId = computed(() => props.participant.identity?.trim() || '')
const userInfo = computed(() => app.getUserInfo(app.activeVoiceHubId, userId.value))

const displayName = computed(() => {
  if (props.isLocal) return app.displayName ?? app.username ?? 'Sen'
  return app.getUserDisplayName(app.activeVoiceHubId, userId.value)
})

const avatarSrc = computed(() => {
  if (props.isLocal) return userAvatarUrl(app.avatarSeed)
  return userAvatarUrl(userInfo.value?.avatar_seed)
})

const isMuted = computed(() => {
  const state = app.voiceStatesByUser[userId.value]
  return state?.muted ?? false
})

const isScreenShareMode = computed(() => props.mode === TileMode.ScreenShare)

// Force trackRevision dependency into computed to bust Vue cache when LiveKit tracks change
function withRevision<T>(fn: () => T): () => T {
  return () => { void props.trackRevision; return fn() }
}

const screenVideoPub = computed(withRevision(() => props.participant.getTrackPublication(Track.Source.ScreenShare)))
const screenAudioPub = computed(withRevision(() => props.participant.getTrackPublication(Track.Source.ScreenShareAudio)))
const cameraPub = computed(withRevision(() => props.participant.getTrackPublication(Track.Source.Camera)))

const publication = computed(() => {
  return isScreenShareMode.value ? screenVideoPub.value : cameraPub.value
})

// Screen share subscription state is managed by VoiceGrid (survives tile remounts)
const screenUnsubscribed = computed(() => {
  if (props.isLocal) return false
  return !props.screenSubscribed
})

// Camera availability vs. subscription are separate: a remote participant may
// publish camera (available) without this client downloading it (subscribed).
const cameraAvailable = computed(() => {
  const pub = cameraPub.value
  return !!pub && !pub.isMuted
})

// Camera subscription state is managed by VoiceGrid (survives tile remounts)
const cameraUnsubscribed = computed(() => {
  if (props.isLocal) return false
  return !props.cameraSubscribed
})

// Initialize: sync LiveKit subscription state with parent-managed state
onMounted(() => {
  if (!isScreenShareMode.value && !props.isLocal) {
    const subscribed = props.cameraSubscribed
    const identity = props.participant.identity?.trim() ?? ''
    const trackSids = [cameraPub.value?.trackSid]
      .filter((sid): sid is string => typeof sid === 'string' && sid.trim().length > 0)
    if (subscribed) allowRemoteCamera(identity, trackSids)
    else disallowRemoteCamera(identity)

    const pub = cameraPub.value
    if (pub) {
      try { ;(pub as any).setSubscribed(subscribed) } catch { /* ignore */ }
    }
    if (subscribed) {
      forceShowVideo.value = true
      nextTick(() => attachVideo())
    }
  }
  if (isScreenShareMode.value && !props.isLocal) {
    const subscribed = props.screenSubscribed
    const identity = props.participant.identity?.trim() ?? ''
    const trackSids = [
      screenVideoPub.value?.trackSid,
      screenAudioPub.value?.trackSid,
    ].filter((sid): sid is string => typeof sid === 'string' && sid.trim().length > 0)
    // Sync audio allowlist so handleTrackSubscribed guard matches
    if (subscribed) allowScreenShareAudio(identity, trackSids)
    else disallowScreenShareAudio(identity)

    const videoPub = screenVideoPub.value
    const audioPub = screenAudioPub.value
    if (videoPub) {
      try { ;(videoPub as any).setSubscribed(subscribed) } catch { /* ignore */ }
    }
    if (audioPub) {
      try { ;(audioPub as any).setSubscribed(subscribed) } catch { /* ignore */ }
    }
    if (subscribed) {
      forceShowVideo.value = true
      nextTick(() => attachVideo())
    }
  }
})

let trackPollTimer: ReturnType<typeof setInterval> | null = null

function clearTrackPoll() {
  if (trackPollTimer) {
    clearInterval(trackPollTimer)
    trackPollTimer = null
  }
}

function toggleScreenSubscription() {
  if (props.isLocal) return
  const wantSubscribe = screenUnsubscribed.value
  clearTrackPoll()
  if (!wantSubscribe) forceShowVideo.value = false

  // Update the audio allowlist BEFORE calling setSubscribed so the
  // handleTrackSubscribed guard in livekit.ts lets the audio through.
  const identity = props.participant.identity?.trim() ?? ''
  const trackSids = [
    screenVideoPub.value?.trackSid,
    screenAudioPub.value?.trackSid,
  ].filter((sid): sid is string => typeof sid === 'string' && sid.trim().length > 0)
  if (wantSubscribe) allowScreenShareAudio(identity, trackSids)
  else disallowScreenShareAudio(identity)

  emit('screen-subscribe', wantSubscribe)

  const videoPub = screenVideoPub.value
  const audioPub = screenAudioPub.value

  if (videoPub) {
    try { ;(videoPub as any).setSubscribed(wantSubscribe) } catch { /* ignore */ }
  }
  if (audioPub) {
    try { ;(audioPub as any).setSubscribed(wantSubscribe) } catch { /* ignore */ }
  }

  if (wantSubscribe) {
    let attempts = 0
    trackPollTimer = setInterval(async () => {
      attempts++
      const pub = props.participant.getTrackPublication(Track.Source.ScreenShare)
      if (pub?.track && pub.isSubscribed) {
        clearTrackPoll()
        forceShowVideo.value = true
        await nextTick()
        await attachVideo()
      } else if (attempts >= VOICE_GRID.TRACK_POLL_MAX_ATTEMPTS) {
        clearTrackPoll()
      }
    }, VOICE_GRID.TRACK_POLL_INTERVAL_MS)
  }
}

function toggleCameraSubscription() {
  if (props.isLocal) return
  const wantSubscribe = cameraUnsubscribed.value
  clearTrackPoll()
  if (!wantSubscribe) forceShowVideo.value = false

  // Update the camera allowlist BEFORE setSubscribed so the subscription policy
  // in livekit.ts lets this participant's camera through.
  const identity = props.participant.identity?.trim() ?? ''
  const trackSids = [cameraPub.value?.trackSid]
    .filter((sid): sid is string => typeof sid === 'string' && sid.trim().length > 0)
  if (wantSubscribe) allowRemoteCamera(identity, trackSids)
  else disallowRemoteCamera(identity)

  emit('camera-subscribe', wantSubscribe)

  const pub = cameraPub.value
  if (pub) {
    try { ;(pub as any).setSubscribed(wantSubscribe) } catch { /* ignore */ }
  }

  if (wantSubscribe) {
    let attempts = 0
    trackPollTimer = setInterval(async () => {
      attempts++
      const p = props.participant.getTrackPublication(Track.Source.Camera)
      if (p?.track && p.isSubscribed) {
        clearTrackPoll()
        forceShowVideo.value = true
        await nextTick()
        await attachVideo()
      } else if (attempts >= VOICE_GRID.TRACK_POLL_MAX_ATTEMPTS) {
        clearTrackPoll()
      }
    }, VOICE_GRID.TRACK_POLL_INTERVAL_MS)
  }
}

function onTileClick() {
  emit('click')
}

const forceShowVideo = ref(false)

const hasVideo = computed(() => {
  if (forceShowVideo.value) return true
  if (isScreenShareMode.value && screenUnsubscribed.value && !props.isLocal) return false
  // Remote camera is opt-in: do not show/download video until the user opts in.
  if (!isScreenShareMode.value && cameraUnsubscribed.value && !props.isLocal) return false
  const pub = publication.value
  if (!pub || pub.isMuted) return false
  if (props.isLocal) return !!pub.track
  return !!pub.track && !!pub.isSubscribed
})

function getFreshTrack() {
  if (isScreenShareMode.value) {
    return props.participant.getTrackPublication(Track.Source.ScreenShare)?.track ?? null
  }
  return props.participant.getTrackPublication(Track.Source.Camera)?.track ?? null
}

let attachedTrack: any = null

function detachVideo() {
  const el = videoEl.value
  if (!el || !attachedTrack) return
  try { attachedTrack.detach(el) } catch { /* ignore */ }
  attachedTrack = null
}

async function attachVideo() {
  const el = videoEl.value
  const track = getFreshTrack() ?? publication.value?.track
  if (!el || !track) return
  if (track === attachedTrack && el.srcObject) return
  if (attachedTrack && attachedTrack !== track) {
    try { attachedTrack.detach(el) } catch { /* ignore */ }
  }
  try {
    track.attach(el)
    attachedTrack = track
    el.muted = true
    await el.play().catch(() => {})
  } catch { /* ignore */ }
}

watch(
  () => publication.value?.track,
  async (newTrack, oldTrack) => {
    if (newTrack === oldTrack) return
    detachVideo()
    if (hasVideo.value) {
      await attachVideo()
    }
  }
)

watch(screenUnsubscribed, async (unsubscribed) => {
  if (unsubscribed) {
    detachVideo()
  } else {
    await nextTick()
    if (hasVideo.value) {
      await attachVideo()
    }
  }
})

watch(cameraUnsubscribed, async (unsubscribed) => {
  if (props.isLocal || isScreenShareMode.value) return
  if (unsubscribed) {
    forceShowVideo.value = false
    detachVideo()
  } else {
    await nextTick()
    if (hasVideo.value) {
      await attachVideo()
    }
  }
})

watch(
  () => publication.value?.isMuted,
  async (newVal, oldVal) => {
    if (newVal === oldVal) return
    if (!hasVideo.value) {
      detachVideo()
      return
    }
    await attachVideo()
  }
)

watch(videoEl, async (el) => {
  if (!el) return
  if (hasVideo.value) {
    await attachVideo()
  }
})

watch(() => props.trackRevision, async () => {
  if (hasVideo.value && videoEl.value) {
    const el = videoEl.value
    const track = publication.value?.track
    if (track && !el.srcObject) {
      await attachVideo()
    }
  }
})

watch(publication, (pub) => {
  if (pub) return
  if (isScreenShareMode.value) {
    emit('screen-subscribe', false)
  } else if (!props.isLocal) {
    emit('camera-subscribe', false)
  }
  forceShowVideo.value = false
})

onMounted(async () => {
  if (hasVideo.value) {
    await attachVideo()
  }
})

onBeforeUnmount(() => {
  clearTrackPoll()
  detachVideo()
  attachedTrack = null
})
</script>

<template>
  <div class="grid-tile-outer">
    <div class="grid-tile" :class="{ 'tile-speaking': !isScreenShareMode && app.isUserSpeaking(userId) }" @click="onTileClick">
      <video
        v-show="hasVideo"
        ref="videoEl"
        autoplay
        playsinline
        muted
        class="tile-video"
        :class="{ 'tile-video-contain': isScreenShareMode }"
      />

      <div v-if="!hasVideo && !isScreenShareMode" class="tile-avatar">
        <img :src="avatarSrc" :alt="displayName" class="avatar-img" />
        <div v-if="cameraAvailable && cameraUnsubscribed && !isLocal" class="camera-optin">
          <span class="camera-badge">Kamera açık</span>
          <button class="watch-stream-btn" @click.stop="toggleCameraSubscription">
            Kamerayı izle
          </button>
        </div>
      </div>

      <div v-if="!hasVideo && isScreenShareMode" class="tile-screen-placeholder">
        <IconScreenShare :size="48" class="placeholder-icon" />
        <button
          v-if="screenUnsubscribed && !isLocal"
          class="watch-stream-btn"
          @click.stop="toggleScreenSubscription"
        >
          Yayını izle
        </button>
        <span v-else class="placeholder-text">Yükleniyor...</span>
      </div>

      <VoiceTileOverlay
        :display-name="displayName"
        :is-screen-share="isScreenShareMode"
        :is-muted="!isScreenShareMode && isMuted"
      />
    </div>

    <VoiceTileMenu
      v-if="!isLocal"
      :display-name="displayName"
      :user-id="userId"
      :mode="mode"
      :participant="participant"
      :publication="publication ?? null"
      :screen-unsubscribed="screenUnsubscribed"
      :camera-available="cameraAvailable && !isScreenShareMode"
      :camera-unsubscribed="cameraUnsubscribed"
      @toggle-screen-subscription="toggleScreenSubscription"
      @toggle-camera-subscription="toggleCameraSubscription"
    />
  </div>
</template>

<style scoped>
.grid-tile-outer {
  position: relative;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.grid-tile {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 18px;
  overflow: hidden;
  background:
    radial-gradient(circle at top, rgba(42, 54, 95, 0.22), rgba(10, 14, 28, 0.96));
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 14px 34px rgba(0, 0, 0, 0.24);
  cursor: pointer;
}

.tile-speaking {
  border-color: rgba(52, 211, 153, 0.7);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 0 0 1px rgba(52, 211, 153, 0.28),
    0 14px 34px rgba(0, 0, 0, 0.24);
}

.tile-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  background: #020617;
}

.tile-video-contain {
  object-fit: contain;
}

.tile-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 24px;
}

.avatar-img {
  width: min(120px, 28%);
  aspect-ratio: 1 / 1;
  border-radius: 999px;
  object-fit: cover;
  border: 2px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.3);
}

.camera-optin {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  pointer-events: none;
}

.camera-badge {
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e2e8f0;
  font-size: 12px;
  font-weight: 700;
  backdrop-filter: blur(8px);
}

.camera-optin .watch-stream-btn {
  pointer-events: auto;
}

.tile-screen-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  gap: 12px;
}

.placeholder-icon {
  color: rgba(148, 163, 184, 0.4);
  stroke-width: 1.5;
}

.placeholder-text {
  font-size: 13px;
  font-weight: 600;
  color: rgba(148, 163, 184, 0.5);
}

.watch-stream-btn {
  padding: 8px 20px;
  border: none;
  border-radius: 999px;
  background: rgba(88, 101, 242, 0.85);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 150ms ease, transform 150ms ease;
}

.watch-stream-btn:hover {
  background: rgba(88, 101, 242, 1);
  transform: scale(1.04);
}

.grid-tile-outer:hover :deep(.tile-menu-btn) {
  opacity: 1;
}
</style>
