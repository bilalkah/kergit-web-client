<script setup lang="ts">
import { computed } from 'vue'
import Avatar from '~/components/ui/Avatar.vue'
import { useAppStore } from '~/stores/app'
import { userAvatarUrl } from '@/src/utils/avatar'

interface TypingUserView {
  userId: string
  displayName: string
  avatarSeed?: string
}

const app = useAppStore()

const typingUsers = computed<TypingUserView[]>(() => {
  const hubId = app.activeHubId
  const channelId = app.activeChannelId
  if (!hubId || !channelId) return []

  const selfId = app.userId
  const typingIds = app.typingByChannel[channelId] ?? []

  return typingIds
    .filter(userId => userId !== selfId)
    .map(userId => {
      return {
        userId,
        displayName: app.getUserDisplayName(hubId, userId),
        avatarSeed: app.getUserInfo(hubId, userId)?.avatar_seed,
      }
    })
})

const visibleAvatars = computed(() => typingUsers.value.slice(0, 3))
const hasTypingUsers = computed(() => typingUsers.value.length > 0)

const typingText = computed(() => {
  const count = typingUsers.value.length
  if (count === 0) return ''
  if (count === 1) return `${typingUsers.value[0]?.displayName ?? 'Biri'} yazıyor...`
  return `${count} kişi yazıyor...`
})
</script>

<template>
  <div class="ui-typing-indicator" :class="{ visible: hasTypingUsers }" role="status" aria-live="polite">
    <template v-if="hasTypingUsers">
      <div class="ui-typing-avatar-stack" aria-hidden="true">
        <Avatar
          v-for="(user, index) in visibleAvatars"
          :key="user.userId"
          class="ui-typing-avatar"
          :src="userAvatarUrl(user.avatarSeed)"
          :alt="user.displayName"
          :size="18"
          :style="{ zIndex: String(visibleAvatars.length - index) }"
        />
      </div>

      <span class="ui-typing-text">{{ typingText }}</span>
    </template>
  </div>
</template>

<style scoped>
.ui-typing-indicator {
  height: 26px;
  min-height: 26px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px 1px 24px;
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}

.ui-typing-indicator.visible {
  opacity: 1;
}

.ui-typing-avatar-stack {
  display: inline-flex;
  align-items: center;
}

.ui-typing-avatar {
  border: 1px solid rgba(148, 163, 184, 0.45);
  margin-left: -6px;
  box-shadow: 0 0 0 2px rgba(9, 14, 34, 0.9);
}

.ui-typing-avatar:first-child {
  margin-left: 0;
}

.ui-typing-text {
  min-width: 0;
  color: rgba(136, 146, 164, 0.84);
  font-size: 12px;
  line-height: 16px;
  padding-bottom: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 1023px) {
  .ui-typing-indicator {
    padding: 0 12px 0 14px;
  }
}
</style>
