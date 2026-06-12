<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAppStore } from '~/stores/app'
import { useWebSocket } from '~/composables/useWebSocket'
import { userAvatarUrl } from '@/src/utils/avatar'
import { protoService } from '@/src/services/proto'
import { getHubRoleMeta, toProtoHubRole } from '@/src/utils/hubRole'
import UserItem from '~/components/ui/UserItem.vue'
import SidebarSectionHeader from '~/components/ui/SidebarSectionHeader.vue'
import ProfileCard from '~/components/ui/ProfileCard.vue'

const props = defineProps<{
  mobileMode?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const app = useAppStore()
const socket = useWebSocket()
const onlineCollapsed = ref(false)
const offlineCollapsed = ref(false)
const nameCollator = new Intl.Collator('tr', { sensitivity: 'base', numeric: true })
const activeProfile = ref<{ userId: string; x: number; y: number } | null>(null)
const hubMemberKickType = ref(55)
const hubMemberRoleUpdateType = ref(57)

const memberDisplayName = (userId: string) => {
  return app.getUserDisplayName(app.viewedHubId, userId)
}

const memberAvatarSeed = (userId: string) => {
  const info = app.getUserInfo(app.viewedHubId, userId)
  return info?.avatar_seed
}

const sortedMembers = computed(() =>
  [...app.viewedMembers].sort((left, right) =>
    nameCollator.compare(
      memberDisplayName(left.user_id),
      memberDisplayName(right.user_id)
    )
  )
)

const onlineMembers = computed(() =>
  sortedMembers.value.filter(member => app.isUserOnline(member.user_id))
)

const offlineMembers = computed(() =>
  sortedMembers.value.filter(member => !app.isUserOnline(member.user_id))
)

function activityForMember(userId: string) {
  for (const [channelId, members] of Object.entries(app.voiceParticipantsByChannel)) {
    if (!members.includes(userId)) continue
    const channel = app.viewedChannels.find(entry => entry.id === channelId)
    return channel ? `${channel.name} kanalında` : 'Ses kanalında'
  }
  return ''
}

const roleMeta = (role: string) => getHubRoleMeta(role)

const onShowProfile = (payload: { userId: string; x: number; y: number }) => {
  activeProfile.value = payload
}

const onShowContext = (payload: { userId: string; x: number; y: number }) => {
  activeProfile.value = payload
}

const closeProfile = () => {
  activeProfile.value = null
}

const onUpdateRole = async (payload: { userId: string; hubId: string; role: 'admin' | 'member' }) => {
  app.clearCommandError(hubMemberRoleUpdateType.value)
  await socket.updateHubMemberRole(payload.hubId, payload.userId, toProtoHubRole(payload.role))
  closeProfile()
}

const onKickUser = async (payload: { userId: string; hubId: string }) => {
  app.clearCommandError(hubMemberKickType.value)
  await socket.kickHubMember(payload.hubId, payload.userId)
  closeProfile()
}

onMounted(() => {
  const { EnvelopeType } = protoService
  hubMemberKickType.value = EnvelopeType.HUB_MEMBER_KICK as number
  hubMemberRoleUpdateType.value = EnvelopeType.HUB_MEMBER_ROLE_UPDATE as number
})
</script>

<template>
  <div class="members-col">
    <div v-if="props.mobileMode" class="mobile-header">
      <h3 class="mobile-title">Üyeler</h3>
      <button class="mobile-close" @click="emit('close')" aria-label="Kapat">×</button>
    </div>

    <div class="header">
      <h3 class="title">ÜYELER</h3>
    </div>

    <div class="list">
      <section class="member-section">
        <SidebarSectionHeader
          :title="`ONLINE — ${onlineMembers.length}`"
          :collapsed="onlineCollapsed"
          @toggle="onlineCollapsed = !onlineCollapsed"
        />
        <Transition name="section-collapse">
        <div
          v-show="!onlineCollapsed"
          class="section-body"
          role="list"
          :aria-label="`Online üyeler (${onlineMembers.length})`"
        >
          <UserItem
            v-for="member in onlineMembers"
            :key="member.user_id"
            class="member"
            :user-id="member.user_id"
            @show-profile="onShowProfile"
            @show-context="onShowContext"
          >
            <div class="avatar-wrap">
              <img class="avatar" :src="userAvatarUrl(memberAvatarSeed(member.user_id))" :alt="memberDisplayName(member.user_id)" />
              <span class="status-dot"></span>
            </div>

            <div class="member-copy">
              <div class="member-line">
                <span class="name">{{ memberDisplayName(member.user_id) }}</span>
                <span class="role-badge" :class="`is-${roleMeta(member.role).key}`">
                  {{ roleMeta(member.role).badge }}
                </span>
                <span v-if="member.user_id === app.userId" class="self-badge">sen</span>
              </div>
              <div v-if="activityForMember(member.user_id)" class="activity">{{ activityForMember(member.user_id) }}</div>
            </div>
          </UserItem>
        </div>
        </Transition>
      </section>

      <section class="member-section">
        <SidebarSectionHeader
          :title="`OFFLINE — ${offlineMembers.length}`"
          :collapsed="offlineCollapsed"
          @toggle="offlineCollapsed = !offlineCollapsed"
        />
        <Transition name="section-collapse">
        <div
          v-show="!offlineCollapsed"
          class="section-body"
          role="list"
          :aria-label="`Çevrimdışı üyeler (${offlineMembers.length})`"
        >
          <UserItem
            v-for="member in offlineMembers"
            :key="member.user_id"
            class="member offline-member"
            :user-id="member.user_id"
            @show-profile="onShowProfile"
            @show-context="onShowContext"
          >
            <div class="avatar-wrap">
              <img class="avatar offline-avatar" :src="userAvatarUrl(memberAvatarSeed(member.user_id))" :alt="memberDisplayName(member.user_id)" />
              <span class="status-dot offline"></span>
            </div>

            <div class="member-copy">
              <div class="member-line">
                <span class="name">{{ memberDisplayName(member.user_id) }}</span>
                <span class="role-badge" :class="`is-${roleMeta(member.role).key}`">
                  {{ roleMeta(member.role).badge }}
                </span>
                <span v-if="member.user_id === app.userId" class="self-badge">sen</span>
              </div>
            </div>
          </UserItem>
        </div>
        </Transition>
      </section>
    </div>

    <ProfileCard
      v-if="activeProfile"
      :user-id="activeProfile.userId"
      :position="{ x: activeProfile.x, y: activeProfile.y }"
      :hub-id="app.viewedHubId"
      @close="closeProfile"
      @update-role="onUpdateRole"
      @kick-user="onKickUser"
    />
  </div>
</template>

<style scoped>
.members-col {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #0a0d1c;
}

.mobile-header {
  display: none;
  width: 100%;
  padding: 12px 16px;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.mobile-title {
  margin: 0;
  color: #eef4ff;
  font-size: 18px;
  font-weight: 700;
}

.mobile-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: #eef4ff;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.header {
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.title {
  margin: 0;
  color: rgba(136, 146, 164, 0.76);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
}

.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  touch-action: pan-y;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 12px 8px;
}

.member-section + .member-section {
  margin-top: 16px;
}

.section-body {
  margin-top: 4px;
  overflow: hidden;
}

.section-collapse-enter-active,
.section-collapse-leave-active {
  transition: max-height 0.22s ease, opacity 0.2s ease;
}

.section-collapse-enter-from,
.section-collapse-leave-to {
  max-height: 0;
  opacity: 0;
}

.section-collapse-enter-to,
.section-collapse-leave-from {
  max-height: 1200px;
  opacity: 1;
}

.member {
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  transition: background 0.18s ease;
}

.member:hover {
  background: rgba(255, 255, 255, 0.04);
}

.offline-member {
  opacity: 0.68;
}

.avatar-wrap {
  position: relative;
  flex-shrink: 0;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  object-fit: cover;
  display: block;
}

.offline-avatar {
  filter: grayscale(0.55);
}

.status-dot {
  position: absolute;
  right: -2px;
  bottom: -1px;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 2px solid #0a0d1c;
  background: #34d399;
  box-shadow: 0 0 6px rgba(52, 211, 153, 0.8);
}

.status-dot.offline {
  background: #64748b;
  box-shadow: none;
}

.member-copy {
  min-width: 0;
  flex: 1;
}

.member-line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.role-badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.role-badge.is-owner {
  color: #fef3c7;
  border-color: rgba(245, 158, 11, 0.48);
  background: rgba(245, 158, 11, 0.22);
}

.role-badge.is-admin {
  color: #ddd6fe;
  border-color: rgba(124, 58, 237, 0.48);
  background: rgba(124, 58, 237, 0.22);
}

.role-badge.is-member {
  color: #bfdbfe;
  border-color: rgba(59, 130, 246, 0.4);
  background: rgba(59, 130, 246, 0.18);
}

.name {
  color: rgba(225, 231, 242, 0.92);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.self-badge {
  padding: 2px 5px;
  border-radius: 6px;
  background: rgba(124, 58, 237, 0.22);
  border: 1px solid rgba(124, 58, 237, 0.25);
  color: #c4b5fd;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  line-height: 1;
}

.activity {
  margin-top: 2px;
  color: #4a5568;
  font-size: 10px;
}

@media (max-width: 1023px) {
  .mobile-header {
    display: flex;
  }

  .header {
    display: none;
  }
}
</style>
