<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import Avatar from '~/components/ui/Avatar.vue'
import { IconClose } from '~/components/icons/Common'
import { useFloatingMemberCard } from '~/composables/useFloatingMemberCard'
import { useAppStore } from '~/stores/app'
import {
  DEFAULT_PARTICIPANT_VOLUME_PERCENT,
  normalizeParticipantVolumePercent,
} from '@/src/services/webrtc/utils'
import { userAvatarUrl } from '@/src/utils/avatar'
import {
  canChangeMemberRole,
  canKickHubMember,
  canKickVoiceParticipant,
  getHubRoleMeta,
  normalizeHubRole,
} from '@/src/utils/hubRole'

type UserContextCardMode = 'profile' | 'voice'

const lastNonZeroVolumeByUser = new Map<string, number>()

const props = withDefaults(defineProps<{
  userId: string
  hubId?: string | null
  channelId?: string | null
  position: { x: number; y: number }
  mode?: UserContextCardMode
}>(), {
  hubId: null,
  channelId: null,
  mode: 'profile',
})

const emit = defineEmits<{
  close: []
  'update-role': [{ userId: string; hubId: string; role: 'admin' | 'member' }]
  'kick-user': [{ userId: string; hubId: string }]
  'kick-user-from-voice': [{ userId: string; hubId: string; channelId: string }]
  'set-user-volume': [{ userId: string; volumePercent: number }]
}>()

const app = useAppStore()
const userVolume = ref(DEFAULT_PARTICIPANT_VOLUME_PERCENT)

const isVoiceMode = computed(() => props.mode === 'voice')

const {
  cardEl,
  positionStyle,
  clampCardPosition,
} = useFloatingMemberCard(
  props,
  {
    close: () => emit('close'),
  },
  { defaultHeight: isVoiceMode.value ? 340 : 280 },
)

const activeHubId = computed(() => props.hubId ?? app.viewedHubId ?? null)

const actorHubRole = computed(() => {
  const hubId = activeHubId.value
  if (!hubId) return 'member'
  const hub = app.hubs.find(entry => entry.id === hubId)
  return normalizeHubRole(hub?.role ?? app.viewedHub?.role ?? 'member')
})

const targetMember = computed(() => {
  const hubId = activeHubId.value
  if (!hubId) return null
  const members = app.membersByHub[hubId] ?? []
  return members.find(member => member.user_id === props.userId) ?? null
})

const targetHubRole = computed(() =>
  normalizeHubRole(targetMember.value?.role ?? 'member')
)

const targetRoleMeta = computed(() => getHubRoleMeta(targetHubRole.value))

const userInfo = computed(() => {
  const hubId = activeHubId.value
  return app.getUserInfo(hubId, props.userId)
})

const displayName = computed(() => {
  if (props.userId === app.userId) {
    return (app.displayName ?? app.username ?? '').trim() || 'Sen'
  }
  return app.getUserDisplayName(activeHubId.value, props.userId)
})

const username = computed(() => {
  if (props.userId === app.userId) {
    const selfUsername = (app.username ?? '').trim()
    if (selfUsername) return selfUsername
  }
  const handle = userInfo.value?.username?.trim()
  if (handle) return handle
  return displayName.value.toLowerCase().replace(/\s+/g, '_')
})

const avatarSrc = computed(() => {
  if (props.userId === app.userId) {
    return userAvatarUrl(app.avatarSeed)
  }
  return userAvatarUrl(userInfo.value?.avatar_seed)
})

const commonHubs = computed(() => {
  const selfId = app.userId
  if (!selfId || !props.userId) return 0

  let count = 0
  for (const members of Object.values(app.membersByHub)) {
    const ids = new Set((members ?? []).map(member => member.user_id))
    if (ids.has(selfId) && ids.has(props.userId)) count += 1
  }
  return count
})

const isSelfUser = computed(() => props.userId === app.userId)

const showCommonHubs = computed(() =>
  !isSelfUser.value && commonHubs.value > 0
)

const isCurrentTabInThisVoiceChannel = computed(() =>
  isVoiceMode.value
  && !!props.channelId
  && !!app.hasLocalActiveVoice
  && app.activeVoiceChannelId === props.channelId
)

const showVolumeControl = computed(() => {
  if (!isVoiceMode.value) return false
  if (!props.channelId || !app.userId) return false
  if (isSelfUser.value) return false
  if (!isCurrentTabInThisVoiceChannel.value) return false

  const participantIds = app.voiceParticipantsByChannel[props.channelId] ?? []
  return participantIds.includes(app.userId) && participantIds.includes(props.userId)
})

const showVolumeUnavailableHint = computed(() =>
  isVoiceMode.value
  && !showVolumeControl.value
  && !(isSelfUser.value && isCurrentTabInThisVoiceChannel.value)
)

const isTargetInVoiceChannel = computed(() => {
  if (!props.channelId) return false
  const participantIds = app.voiceParticipantsByChannel[props.channelId] ?? []
  return participantIds.includes(props.userId)
})

const canPromoteToAdmin = computed(() =>
  canChangeMemberRole(
    actorHubRole.value,
    targetHubRole.value,
    'admin',
    app.userId,
    props.userId,
  )
)

const canDemoteToMember = computed(() =>
  canChangeMemberRole(
    actorHubRole.value,
    targetHubRole.value,
    'member',
    app.userId,
    props.userId,
  )
)

const canKickFromHub = computed(() => {
  if (!activeHubId.value) return false
  return canKickHubMember(
    actorHubRole.value,
    targetHubRole.value,
    app.userId,
    props.userId,
  )
})

const canKickFromVoice = computed(() => {
  if (!activeHubId.value || !props.channelId || !isTargetInVoiceChannel.value) return false
  return canKickVoiceParticipant(
    actorHubRole.value,
    targetHubRole.value,
    app.userId,
    props.userId,
  )
})

const hasVoiceActions = computed(() =>
  isVoiceMode.value && canKickFromVoice.value
)

const hasServerModerationActions = computed(() =>
  !isVoiceMode.value && (
    canPromoteToAdmin.value ||
    canDemoteToMember.value ||
    canKickFromHub.value
  )
)

const isUserMutedLocally = computed(() =>
  normalizeParticipantVolumePercent(userVolume.value) <= 0
)

const muteToggleLabel = computed(() =>
  isUserMutedLocally.value ? 'Sesi Aç' : 'Sesi Kapat'
)

function applyUserVolume(nextVolume: number) {
  const normalizedVolume = normalizeParticipantVolumePercent(nextVolume)
  userVolume.value = normalizedVolume
  if (normalizedVolume > 0) {
    lastNonZeroVolumeByUser.set(props.userId, normalizedVolume)
  }
  emit('set-user-volume', {
    userId: props.userId,
    volumePercent: normalizedVolume,
  })
}

function syncUserVolume() {
  if (!isVoiceMode.value) return
  const nextVolume = normalizeParticipantVolumePercent(app.getUserVolumeOverride(props.userId))
  userVolume.value = nextVolume
  if (nextVolume > 0) {
    lastNonZeroVolumeByUser.set(props.userId, nextVolume)
  }
}

function onVolumeChange(event: Event) {
  const target = event.target as HTMLInputElement | null
  const nextVolume = Number.parseInt(target?.value ?? String(DEFAULT_PARTICIPANT_VOLUME_PERCENT), 10)
  applyUserVolume(nextVolume)
}

function onToggleUserMute() {
  if (!isUserMutedLocally.value) {
    applyUserVolume(0)
    return
  }

  const restoredVolume = lastNonZeroVolumeByUser.get(props.userId) ?? DEFAULT_PARTICIPANT_VOLUME_PERCENT
  applyUserVolume(restoredVolume)
}

function onMakeAdmin() {
  if (!activeHubId.value) return
  emit('update-role', {
    userId: props.userId,
    hubId: activeHubId.value,
    role: 'admin',
  })
}

function onMakeMember() {
  if (!activeHubId.value) return
  emit('update-role', {
    userId: props.userId,
    hubId: activeHubId.value,
    role: 'member',
  })
}

function onKickFromHub() {
  if (!activeHubId.value) return
  emit('kick-user', {
    userId: props.userId,
    hubId: activeHubId.value,
  })
}

function onKickFromVoice() {
  if (!activeHubId.value || !props.channelId) return
  emit('kick-user-from-voice', {
    userId: props.userId,
    hubId: activeHubId.value,
    channelId: props.channelId,
  })
}

watch(
  () => [props.position.x, props.position.y, props.userId, props.channelId, props.mode] as const,
  async () => {
    syncUserVolume()
    await nextTick()
    clampCardPosition()
  },
  { immediate: true },
)

watch(
  () => app.userVolumeOverrides[props.userId],
  () => {
    syncUserVolume()
  },
)
</script>

<template>
  <Teleport to="body">
    <div ref="cardEl" class="ui-profile-card" :style="positionStyle" role="dialog" aria-modal="false">
      <button class="ui-profile-close" type="button" aria-label="Profili kapat" @click="emit('close')">
        <IconClose :size="16" />
      </button>

      <div class="ui-profile-head">
        <Avatar :src="avatarSrc" :alt="displayName" :size="68" />
      </div>

      <div class="ui-profile-body">
        <h3 class="ui-profile-name">{{ displayName }}</h3>
        <div class="ui-profile-username">@{{ username }}</div>

        <div class="ui-profile-role-row">
          <span class="ui-role-badge" :class="`is-${targetRoleMeta.key}`">
            {{ targetRoleMeta.badge }}
          </span>
          <span class="ui-profile-role-label">{{ targetRoleMeta.label }}</span>
        </div>

        <div v-if="showCommonHubs" class="ui-profile-common">
          🔗 {{ commonHubs }} Ortak Sunucu
        </div>
      </div>

      <div v-if="showVolumeControl" class="ui-profile-volume">
        <div class="ui-profile-volume-title">KULLANICI SES SEVİYESİ</div>
        <div class="ui-profile-volume-row">
          <input class="ui-profile-volume-slider" type="range" min="0" max="200" step="1" :value="userVolume"
            @input="onVolumeChange">
          <span class="ui-profile-volume-label">{{ userVolume }}%</span>
        </div>
        <button class="ui-profile-action" type="button" @click="onToggleUserMute">
          {{ muteToggleLabel }}
        </button>
      </div>

      <div v-if="showVolumeUnavailableHint" class="ui-profile-volume ui-profile-volume--disabled">
        <div class="ui-profile-volume-title">KULLANICI SES SEVİYESİ</div>
        <div class="ui-profile-volume-hint">Ses kontrolü için aynı ses kanalında olmalısın.</div>
      </div>

      <div v-if="hasVoiceActions" class="ui-profile-admin">
        <div class="ui-profile-admin-title">SES KANALI</div>

        <button v-if="canKickFromVoice" class="ui-profile-action danger" type="button" @click="onKickFromVoice">
          Sesten At
        </button>
      </div>

      <div v-if="hasServerModerationActions" class="ui-profile-admin">
        <div class="ui-profile-admin-title">SUNUCU MODERASYONU</div>

        <button v-if="canPromoteToAdmin" class="ui-profile-action" type="button" @click="onMakeAdmin">
          Yönetici Yap
        </button>

        <button v-if="canDemoteToMember" class="ui-profile-action" type="button" @click="onMakeMember">
          Üyeye Döndür
        </button>

        <button v-if="canKickFromHub" class="ui-profile-action danger" type="button" @click="onKickFromHub">
          Sunucudan At
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ui-profile-card {
  position: fixed;
  z-index: 90;
  width: min(340px, calc(100vw - 24px));
  border-radius: 14px;
  border: 1px solid rgba(124, 58, 237, 0.28);
  background: linear-gradient(160deg, rgba(16, 21, 44, 0.97), rgba(10, 13, 29, 0.96));
  box-shadow: 0 18px 48px rgba(4, 8, 24, 0.66);
  overflow: hidden;
}

.ui-profile-close {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(226, 232, 240, 0.9);
  background: rgba(148, 163, 184, 0.14);
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;
}

.ui-profile-close svg {
  width: 14px;
  height: 14px;
}

.ui-profile-close:hover {
  background: rgba(148, 163, 184, 0.26);
  color: #ffffff;
}

.ui-profile-close:active {
  background: rgba(148, 163, 184, 0.34);
}

.ui-profile-close:focus-visible {
  outline: 2px solid rgba(124, 58, 237, 0.72);
  outline-offset: 2px;
}

.ui-profile-head {
  padding: 16px 16px 10px;
}

.ui-profile-body {
  padding: 0 16px 14px;
}

.ui-profile-name {
  margin: 0;
  color: #eef4ff;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
}

.ui-profile-username {
  margin-top: 4px;
  color: rgba(148, 163, 184, 0.95);
  font-size: 13px;
}

.ui-profile-role-row {
  margin-top: 10px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.ui-profile-role-label {
  color: rgba(226, 232, 240, 0.92);
  font-size: 12px;
  font-weight: 600;
}

.ui-role-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.07em;
}

.ui-role-badge.is-owner {
  color: #fef3c7;
  border-color: rgba(245, 158, 11, 0.45);
  background: rgba(245, 158, 11, 0.2);
}

.ui-role-badge.is-admin {
  color: #ddd6fe;
  border-color: rgba(124, 58, 237, 0.45);
  background: rgba(124, 58, 237, 0.24);
}

.ui-role-badge.is-member {
  color: #bfdbfe;
  border-color: rgba(59, 130, 246, 0.35);
  background: rgba(59, 130, 246, 0.18);
}

.ui-profile-common {
  margin-top: 10px;
  color: rgba(148, 163, 184, 0.82);
  font-size: 12px;
}

.ui-profile-volume {
  padding: 12px 16px 14px;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
  display: grid;
  gap: 10px;
}

.ui-profile-volume--disabled {
  gap: 6px;
}

.ui-profile-volume-title {
  color: rgba(136, 146, 164, 0.88);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.ui-profile-volume-hint {
  color: rgba(148, 163, 184, 0.82);
  font-size: 12px;
}

.ui-profile-volume-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ui-profile-volume-slider {
  flex: 1;
  width: 100%;
  height: 10px;
  margin: 0;
  border: 0;
  outline: none;
  background: transparent;
  -webkit-appearance: none;
  appearance: none;
}

.ui-profile-volume-slider::-webkit-slider-runnable-track {
  height: 10px;
  border-radius: 999px;
  background: linear-gradient(90deg,
      #f59e0b 0%,
      #f59e0b 34%,
      #22c55e 34%,
      #22c55e 74%,
      #a855f7 74%,
      #a855f7 100%);
}

.ui-profile-volume-slider::-moz-range-track {
  height: 10px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(90deg,
      #f59e0b 0%,
      #f59e0b 34%,
      #22c55e 34%,
      #22c55e 74%,
      #a855f7 74%,
      #a855f7 100%);
}

.ui-profile-volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  margin-top: -2px;
  border-radius: 999px;
  border: 1px solid rgba(15, 23, 42, 0.72);
  background: #f8fafc;
  box-shadow: 0 1px 4px rgba(2, 6, 23, 0.45);
}

.ui-profile-volume-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border: 1px solid rgba(15, 23, 42, 0.72);
  border-radius: 999px;
  background: #f8fafc;
  box-shadow: 0 1px 4px rgba(2, 6, 23, 0.45);
}

.ui-profile-volume-label {
  width: 52px;
  text-align: right;
  color: #94a3b8;
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
}

.ui-profile-admin {
  padding: 12px 16px 14px;
  border-top: 1px solid rgba(148, 163, 184, 0.18);
  display: grid;
  gap: 8px;
}

.ui-profile-admin-title {
  color: rgba(136, 146, 164, 0.8);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.ui-profile-action {
  width: 100%;
  border: 0;
  border-radius: 10px;
  padding: 10px 12px;
  background: rgba(148, 163, 184, 0.12);
  color: rgba(226, 232, 240, 0.95);
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}

.ui-profile-action:hover {
  background: rgba(148, 163, 184, 0.2);
}

.ui-profile-action.danger {
  color: #fda4af;
  background: rgba(244, 63, 94, 0.14);
}

.ui-profile-action.danger:hover {
  background: rgba(244, 63, 94, 0.22);
}
</style>
