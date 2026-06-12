<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAppStore, ChannelType } from '~/stores/app'
import { useWebSocket } from '~/composables/useWebSocket'
import { userAvatarUrl } from '@/src/utils/avatar'
import { protoService } from '@/src/services/proto'
import { toProtoHubRole } from '@/src/utils/hubRole'
import { devWarn } from '@/src/utils/safeLogger'
import ChatMessageBubble from '~/components/ui/messages/ChatMessageBubble.vue'
import DateDivider from '~/components/ui/DateDivider.vue'
import ProfileCard from '~/components/ui/ProfileCard.vue'
import EmptyState from '~/components/ui/EmptyState.vue'
import { ChatAttachmentKind } from '@/src/features/messages/types'
import type {
  ChatMessageAttachment,
  ChatMessageAttachmentSignedUrlResolver,
  ChatMessageBubbleModel,
} from '@/src/features/messages/types'

const app = useAppStore()
const socket = useWebSocket()

const listEl = ref<HTMLElement | null>(null)
const activeProfile = ref<{ userId: string; x: number; y: number } | null>(null)
const isFetchingHistory = ref(false)
const pendingBeforeId = ref<string | null>(null)
const pendingMessageCount = ref(0)
const lastRequestAtMs = ref(0)
const hubMemberKickType = ref(55)
const hubMemberRoleUpdateType = ref(57)
let pendingTimeoutId: number | null = null
const signingActiveChannel = ref(false)

const activeHubId = computed(() => app.activeHubId)
const activeChannelId = computed(() => app.activeChannelId)

const activeHubChannels = computed(() => {
  const hubId = activeHubId.value
  if (!hubId) return []
  return app.channelsByHub[hubId] ?? []
})

const hasTextChannels = computed(() =>
  activeHubChannels.value.some(channel => channel.type === ChannelType.Text)
)

const emptyTitle = computed(() => {
  if (!activeHubId.value) return 'Kergit sohbetine hoş geldin'
  if (!hasTextChannels.value) return 'Henüz metin kanalı yok'
  return 'Bir kanal seç'
})

const emptySubtitle = computed(() => {
  if (!activeHubId.value) return 'Sohbeti başlatmak için bir sunucu seç'
  if (!hasTextChannels.value) return 'Mesajlaşmak için bir metin kanalı oluştur ya da katıl.'
  return 'Sohbete başlamak için bir kanal seç'
})

const messages = computed(() => {
  const channelId = activeChannelId.value
  if (!channelId) return []
  return app.messagesForChannel(channelId)
})

const nameById = computed(() => {
  const hubId = activeHubId.value
  if (!hubId) return new Map<string, string>()
  const hubUsers = app.usersLookup[hubId] ?? {}
  return new Map(Object.keys(hubUsers).map(uid => [uid, app.getUserDisplayName(hubId, uid)]))
})

const avatarById = computed(() => {
  const hubId = activeHubId.value
  if (!hubId) return new Map<string, string>()
  const hubUsers = app.usersLookup[hubId] ?? {}
  return new Map(Object.entries(hubUsers).map(([uid, info]) => [uid, info.avatar_seed ?? '']))
})

const accentForUser = (userId: string) => {
  if (userId === app.userId) return '#22d3ee'
  const accents = ['#7c3aed', '#06b6d4', '#10b981', '#a855f7']
  let total = 0
  for (const ch of userId) total += ch.charCodeAt(0)
  return accents[total % accents.length] ?? accents[0] ?? '#7c3aed'
}

const historyExhausted = computed(() => {
  const channelId = activeChannelId.value
  if (!channelId) return false
  return app.isHistoryExhausted(channelId)
})

const oldestMessageCursor = computed(() => {
  const channelId = activeChannelId.value
  if (!channelId) return null
  return app.getOldestMessageCursor(channelId)
})

const latestMessageCursor = computed(() => {
  const channelId = activeChannelId.value
  if (!channelId) return null
  return app.getLatestMessageCursor(channelId)
})

const startOfDay = (ms: number) => {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const formatDayLabel = (ms: number) => {
  if (!ms) return 'Bilinmeyen tarih'
  const today = startOfDay(Date.now())
  const target = startOfDay(ms)
  const diffDays = Math.round((target - today) / 86400000)
  if (diffDays === 0) return 'Bugün'
  if (diffDays === -1) return 'Dün'
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(ms))
}

const formatTime = (ms: number) => {
  if (!ms) return ''
  return new Date(ms).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const isNearBottom = () => {
  if (!listEl.value) return true
  const { scrollTop, scrollHeight, clientHeight } = listEl.value
  return scrollHeight - (scrollTop + clientHeight) < 120
}

const scrollToBottom = async () => {
  await nextTick()
  if (!listEl.value) return
  listEl.value.scrollTop = listEl.value.scrollHeight
}

const resolveMessageAttachments = (channelId: string, attachments: ChatMessageAttachment[]) =>
  attachments.map((attachment) => ({
    ...attachment,
    signedUrl: app.getCachedSignedAttachmentUrl(channelId, attachment.storageKey),
  }))

const resolveSignedUrlForAttachment: ChatMessageAttachmentSignedUrlResolver = async (
  attachment,
  options,
) => {
  const channelId = activeChannelId.value ?? ''
  return app.resolveAttachmentSignedUrl(channelId, attachment.storageKey, Boolean(options?.forceRefresh))
}

const ensureSignedUrlsForActiveChannel = async () => {
  const channelId = activeChannelId.value
  if (!channelId || signingActiveChannel.value) return

  const rawMessages = messages.value
  if (rawMessages.length === 0) return

  const uniqueStorageKeys = new Set<string>()
  for (const message of rawMessages) {
    for (const attachment of message.attachments ?? []) {
      if (!attachment.storageKey) continue
      if (
        attachment.kind === ChatAttachmentKind.Image &&
        app.hasCachedAttachmentPreviewObjectUrl(channelId, attachment.storageKey)
      ) {
        continue
      }
      if (app.getCachedSignedAttachmentUrl(channelId, attachment.storageKey)) continue
      uniqueStorageKeys.add(attachment.storageKey)
    }
  }
  if (uniqueStorageKeys.size === 0) return

  signingActiveChannel.value = true
  try {
    await app.ensureSignedAttachmentUrls(channelId, Array.from(uniqueStorageKeys))
  } catch (error) {
    devWarn('[message-list] failed to warm attachment signed URLs', error)
  } finally {
    signingActiveChannel.value = false
  }
}

enum RenderItemType {
  Divider = 'divider',
  Message = 'message',
}

const renderItemType = RenderItemType

type RenderItem =
  | { type: RenderItemType.Divider; key: string; label: string }
  | {
      type: RenderItemType.Message
      key: string
      msg: ChatMessageBubbleModel
      grouped: boolean
      own: boolean
      authorId: string
      name: string
      avatar: string
      accent: string
    }

const renderItems = computed<RenderItem[]>(() => {
  const items: RenderItem[] = []
  let lastDayKey = ''
  let previousMessage: (typeof messages.value)[number] | null = null
  const channelId = activeChannelId.value ?? ''

  for (const msg of messages.value) {
    const dayKey = String(startOfDay(msg.created_at_ms || 0))
    if (dayKey !== lastDayKey) {
      items.push({
        type: RenderItemType.Divider,
        key: `day-${dayKey}`,
        label: formatDayLabel(msg.created_at_ms),
      })
      lastDayKey = dayKey
      previousMessage = null
    }

    const authorId = msg.author_id ?? ''
    if (!authorId) continue
    const own = authorId === app.userId
    const grouped = previousMessage?.author_id === authorId
    items.push({
      type: RenderItemType.Message,
      key: msg.id,
      msg: {
        id: msg.id,
        content: msg.content ?? '',
        own,
        createdAtMs: msg.created_at_ms ?? 0,
        attachments: channelId ? resolveMessageAttachments(channelId, msg.attachments ?? []) : [],
        linkPreview: msg.link_preview ?? null,
      },
      own,
      grouped,
      authorId,
      name: own
        ? 'Sen'
        : (nameById.value.get(authorId) ?? app.getUserDisplayName(activeHubId.value, authorId)),
      avatar: userAvatarUrl(avatarById.value.get(authorId)),
      accent: accentForUser(authorId),
    })
    previousMessage = msg
  }

  return items
})

const clearPendingHistory = () => {
  isFetchingHistory.value = false
  pendingBeforeId.value = null
  pendingMessageCount.value = 0
  if (pendingTimeoutId !== null) {
    clearTimeout(pendingTimeoutId)
    pendingTimeoutId = null
  }
}

const openProfileCard = (payload: { userId: string; x: number; y: number }) => {
  activeProfile.value = payload
}

const closeProfileCard = () => {
  activeProfile.value = null
}

const onUpdateRole = async (payload: { userId: string; hubId: string; role: 'admin' | 'member' }) => {
  app.clearCommandError(hubMemberRoleUpdateType.value)
  await socket.updateHubMemberRole(payload.hubId, payload.userId, toProtoHubRole(payload.role))
  closeProfileCard()
}

const onKickUser = async (payload: { userId: string; hubId: string }) => {
  app.clearCommandError(hubMemberKickType.value)
  await socket.kickHubMember(payload.hubId, payload.userId)
  closeProfileCard()
}

const scheduleHistoryTimeout = () => {
  if (typeof window === 'undefined') return
  if (pendingTimeoutId !== null) clearTimeout(pendingTimeoutId)
  pendingTimeoutId = window.setTimeout(() => {
    pendingTimeoutId = null
    if (isFetchingHistory.value) clearPendingHistory()
  }, 2000)
}

const loadOlder = async () => {
  const channelId = activeChannelId.value
  if (!channelId || isFetchingHistory.value || app.isHistoryExhausted(channelId)) return

  const now = Date.now()
  if (now - lastRequestAtMs.value < 800) return

  const beforeCursor = app.getOldestMessageCursor(channelId)
  const beforeId = beforeCursor?.message_id ?? null
  if (!beforeCursor || !beforeId || pendingBeforeId.value === beforeId) return

  lastRequestAtMs.value = now
  isFetchingHistory.value = true
  pendingBeforeId.value = beforeId
  pendingMessageCount.value = messages.value.length
  scheduleHistoryTimeout()
  await socket.fetchMessagesBefore(channelId, beforeCursor)
}

const onScroll = () => {
  if (!listEl.value) return
  if (listEl.value.scrollTop <= 24) void loadOlder()
}

watch(activeChannelId, () => {
  clearPendingHistory()
  void scrollToBottom()
  void ensureSignedUrlsForActiveChannel()
})

watch(
  () => [
    messages.value.length,
    messages.value.map((message) => message.attachments.map((attachment) => attachment.storageKey).join(',')).join('|'),
    oldestMessageCursor.value?.message_id ?? null,
    latestMessageCursor.value?.message_id ?? null,
  ] as const,
  (next, prev) => {
    const [nextLength, nextAttachmentSignature, nextOldestId, nextLatestId] = next
    const [prevLength, prevAttachmentSignature, prevOldestId, prevLatestId] = prev ?? [0, '', null, null]

    if (pendingBeforeId.value && (nextLength !== pendingMessageCount.value || nextOldestId !== pendingBeforeId.value)) {
      clearPendingHistory()
    }

    const windowChanged =
      nextLength !== prevLength ||
      nextOldestId !== prevOldestId ||
      nextLatestId !== prevLatestId
    const attachmentSignatureChanged = nextAttachmentSignature !== prevAttachmentSignature

    if (!windowChanged && !attachmentSignatureChanged) return
    if (isNearBottom()) void scrollToBottom()
    void ensureSignedUrlsForActiveChannel()
  }
)

watch(historyExhausted, exhausted => {
  if (exhausted && pendingBeforeId.value) clearPendingHistory()
})

onMounted(() => {
  const { EnvelopeType } = protoService
  hubMemberKickType.value = EnvelopeType.HUB_MEMBER_KICK as number
  hubMemberRoleUpdateType.value = EnvelopeType.HUB_MEMBER_ROLE_UPDATE as number
  void scrollToBottom()
  void ensureSignedUrlsForActiveChannel()
})

onBeforeUnmount(() => {
  clearPendingHistory()
})
</script>

<template>
  <div class="message-panel">
    <div ref="listEl" class="message-stream" @scroll="onScroll">
      <div v-if="!activeChannelId" class="empty-state">
        <EmptyState
          icon="💬"
          :title="emptyTitle"
          :message="emptySubtitle"
          compact
        />
      </div>

      <template v-else>
        <div v-if="isFetchingHistory" class="history-loader">
          <span class="spinner" aria-hidden="true"></span>
          <span>Eski mesajlar yükleniyor...</span>
        </div>

        <div v-if="messages.length === 0" class="welcome">
          <EmptyState
            icon="#"
            :title="`#${app.activeChannel?.name} kanalına hoş geldin`"
            :message="`${app.activeChannel?.name} kanalındaki ilk mesaj burada başlayacak.`"
          />
        </div>

        <template v-for="item in renderItems" :key="item.key">
          <DateDivider v-if="item.type === renderItemType.Divider" :label="item.label" />

          <div v-else class="message-row" :class="{ 'from-me': item.own, grouped: item.grouped }">
            <div class="avatar-slot">
              <button
                v-if="!item.grouped"
                class="avatar-hit"
                type="button"
                :aria-label="`${item.name} profilini aç`"
                @click.stop="openProfileCard({ userId: item.authorId, x: $event.clientX, y: $event.clientY })"
              >
                <img class="avatar" :src="item.avatar" :alt="item.name" />
              </button>
              <span v-else class="avatar-spacer" aria-hidden="true"></span>
            </div>

            <div class="message-block" :class="{ 'from-me': item.own }">
              <div v-if="!item.grouped" class="message-meta" :class="{ 'from-me': item.own }">
                <span class="name" :style="{ color: item.accent }">{{ item.name }}</span>
                <span class="time">{{ formatTime(item.msg.createdAtMs) }}</span>
              </div>

              <div class="bubble-wrap" :class="{ 'from-me': item.own }">
                <span
                  v-if="item.grouped && item.own"
                  class="hover-time hover-time--before"
                >
                  {{ formatTime(item.msg.createdAtMs) }}
                </span>

                <ChatMessageBubble
                  :channel-id="activeChannelId ?? ''"
                  :message="item.msg"
                  :resolve-attachment-signed-url="resolveSignedUrlForAttachment"
                />

                <span
                  v-if="item.grouped && !item.own"
                  class="hover-time hover-time--after"
                >
                  {{ formatTime(item.msg.createdAtMs) }}
                </span>
              </div>
            </div>
          </div>
        </template>

      </template>
    </div>

    <ProfileCard
      v-if="activeProfile"
      :user-id="activeProfile.userId"
      :position="{ x: activeProfile.x, y: activeProfile.y }"
      :hub-id="activeHubId"
      @close="closeProfileCard"
      @update-role="onUpdateRole"
      @kick-user="onKickUser"
    />
  </div>
</template>

<style scoped>
.message-panel {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-x: hidden;
}

.message-stream {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.empty-state {
  flex: 1;
  display: grid;
  place-items: center;
}

.welcome {
  margin: auto 0;
  text-align: center;
}

.welcome h3 {
  margin: 0;
  color: #f2f7ff;
  font-size: 18px;
  font-weight: 600;
}

.welcome p {
  margin: 8px 0 0;
  color: rgba(136, 146, 164, 0.76);
  font-size: 14px;
}

.history-loader {
  align-self: center;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: rgba(221, 230, 249, 0.88);
  font-size: 12px;
  margin-bottom: 14px;
}

.spinner {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  border: 2px solid rgba(148, 163, 184, 0.3);
  border-top-color: rgba(34, 211, 238, 0.85);
  animation: spin 0.8s linear infinite;
}

.message-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-top: 16px;
  min-width: 0;
}

.message-row.grouped {
  margin-top: 2px;
}

.message-row.from-me {
  flex-direction: row-reverse;
}

.avatar-slot {
  width: 32px;
  flex: 0 0 32px;
  display: flex;
  justify-content: center;
}

.avatar-hit {
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  object-fit: cover;
  display: block;
}

.avatar-spacer {
  width: 32px;
  height: 32px;
  display: block;
}

.message-block {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.message-block.from-me {
  align-items: flex-end;
}

.message-meta {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}

.message-meta.from-me {
  justify-content: flex-end;
}

.name {
  font-size: 14px;
  font-weight: 600;
}

.time {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #4a5568;
}

.bubble-wrap {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  max-width: 100%;
}

.bubble-wrap.from-me {
  justify-content: flex-end;
}

.hover-time {
  display: inline-flex;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #4a5568;
  opacity: 0;
  pointer-events: none;
  white-space: nowrap;
  transition: opacity 0.16s ease;
}

.hover-time--before {
  order: -1;
  flex: 0 0 0;
  min-width: 0;
  overflow: visible;
  justify-content: flex-end;
  transform: translateX(-8px);
}

.hover-time--after {
  flex: 0 0 0;
  min-width: 0;
  overflow: visible;
  transform: translateX(8px);
}

.message-row.grouped .bubble-wrap:hover .hover-time {
  opacity: 1;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1023px) {
  .message-stream {
    padding: 14px 14px 22px;
  }

  .message-block {
    max-width: 84%;
  }
}
</style>
