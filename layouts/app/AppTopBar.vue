<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { useWebSocket } from '~/composables/useWebSocket'
import { devLog } from '@/src/utils/safeLogger'
import { ChannelType } from '~/stores/app'
import PingIndicator from '~/components/ui/PingIndicator.vue'
import UserSettingsModal from '../../components/ui/modals/UserSettingsModal.vue'

defineOptions({
  inheritAttrs: false,
})

const auth = useAuthStore()
const socket = useWebSocket()
const app = useAppStore()
const router = useRouter()
const route = useRoute()
const attrs = useAttrs()

const activeChannelName = computed(() =>
  app.activeChannel?.name?.trim() || 'kanal'
)

const pingValue = computed(() => socket.pingMs.value)
const onlineMemberCount = computed(() =>
  app.viewedMembers.reduce((count, member) => (
    app.isUserOnline(member.user_id) ? count + 1 : count
  ), 0)
)

const channelDescription = computed(() => {
  const hubName = app.viewedHub?.name?.trim()
  if (!hubName) return 'Gerçek zamanlı sohbet alanı'
  if (!app.activeChannel) return `${hubName} topluluğu`
  if (app.activeChannel.type === ChannelType.Voice) return `${hubName} ses kanalı`
  return `${hubName} genel sohbet kanalı`
})

const isSocketConnected = computed(() => socket.connected.value)
const isSocketReconnecting = computed(() => {
  if (socket.connected.value) return false
  return socket.reconnectIn.value !== null
})
const isDesktop = ref(false)
const settingsOpen = ref(false)

const membersPanelActive = computed(() =>
  isDesktop.value ? app.desktopMembersOpen : app.mobilePanels.membersOpen
)
const isHomeRoute = computed(() => route.path === '/app')

async function onLogout() {
  devLog('[AppTopBar] Logging out...')
  await auth.logoutWithTransition(router, async () => {
    socket.disconnect()
    app.clearAll()
  })
}

function syncViewportState() {
  if (!import.meta.client) return
  isDesktop.value = window.matchMedia('(min-width: 1024px)').matches
  if (isDesktop.value) {
    app.closeMobilePanels()
  }
}

function onToggleMembers() {
  if (isHomeRoute.value) return
  if (isDesktop.value) {
    app.toggleDesktopMembersPanel()
    return
  }
  app.toggleMembersPanel()
}

function onToggleChannels() {
  if (isDesktop.value) return
  app.toggleChannelsPanel()
}

function openUserSettings() {
  settingsOpen.value = true
}

function handleOpenSettingsEvent() {
  openUserSettings()
}

onMounted(() => {
  syncViewportState()
  if (!import.meta.client) return
  window.addEventListener('resize', syncViewportState)
  window.addEventListener('app-open-user-settings', handleOpenSettingsEvent as EventListener)
})

onBeforeUnmount(() => {
  if (!import.meta.client) return
  window.removeEventListener('resize', syncViewportState)
  window.removeEventListener('app-open-user-settings', handleOpenSettingsEvent as EventListener)
})
</script>


<template>
  <div class="topbar" v-bind="attrs">
    <div class="left">
      <button
        class="chrome-btn hamburger-btn"
        :class="{ active: app.mobilePanels.channelsOpen }"
        :aria-expanded="app.mobilePanels.channelsOpen ? 'true' : 'false'"
        aria-label="Kanalları aç veya kapat"
        @click="onToggleChannels"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M4 12h12M4 17h10" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8" />
        </svg>
      </button>

      <NuxtLink to="/app" class="brand-link" aria-label="Kergit ana sayfası">
        <img class="brand-icon" src="/icon.png" alt="" />
        <span class="brand-name">Kergit</span>
      </NuxtLink>

      <span class="brand-separator" aria-hidden="true"></span>

      <div class="channel-summary">
        <div class="channel-line">
          <span class="channel-icon">#</span>
          <span class="channel-name">{{ activeChannelName }}</span>
          <span class="channel-separator"></span>
          <span class="channel-description">{{ channelDescription }}</span>
        </div>
      </div>
    </div>

    <div class="right">
      <PingIndicator class="ping-indicator-slot" :ping="pingValue" :connected="isSocketConnected" :reconnecting="isSocketReconnecting" />

      <button
        v-if="!isHomeRoute"
        class="icon-pill members-toggle"
        :class="{ active: membersPanelActive }"
        :aria-label="`Üyeler (${onlineMemberCount})`"
        @click="onToggleMembers"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          <circle cx="9.5" cy="7" r="3" fill="none" stroke="currentColor" stroke-width="1.8" />
          <path d="M20 21v-2a4 4 0 0 0-2.2-3.58" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M15 4.2a3 3 0 0 1 0 5.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="members-count" aria-hidden="true">{{ onlineMemberCount }}</span>
      </button>

      <button class="logout-btn" @click="onLogout">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M10 17l5-5-5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M15 12H4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        <span>Çıkış</span>
      </button>
    </div>
  </div>

  <UserSettingsModal v-model="settingsOpen" />
</template>

<style scoped>
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 100%;
  width: 100%;
  padding: 0 20px;
  color: #dbe6ff;
  font-size: 13px;
  background: #0a0d1c;
}

.left,
.right {
  display: flex;
  align-items: center;
  min-width: 0;
}

.left {
  gap: 12px;
  flex: 1;
}

.brand-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  color: #f7fbff;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.brand-icon {
  width: 26px;
  height: 26px;
  object-fit: contain;
  filter: drop-shadow(0 0 10px rgba(110, 119, 255, 0.26));
}

.brand-separator {
  width: 1px;
  height: 20px;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.08);
}

.right {
  gap: 8px;
  flex-shrink: 0;
}

.chrome-btn,
.icon-pill,
.logout-btn {
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(255, 255, 255, 0.04);
  color: #6f7891;
  transition: border-color 0.22s ease, color 0.22s ease, transform 0.22s ease, box-shadow 0.22s ease;
}

.chrome-btn:hover,
.icon-pill:hover,
.logout-btn:hover {
  transform: translateY(-1px);
  color: #eef4ff;
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow: 0 10px 24px rgba(3, 7, 18, 0.22);
}

.chrome-btn {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.hamburger-btn {
  display: none;
}

.chrome-btn svg,
.icon-pill svg,
.logout-btn svg {
  width: 16px;
  height: 16px;
}

.channel-summary {
  min-width: 0;
  display: flex;
  align-items: center;
}

.channel-line {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.channel-icon {
  color: rgba(255, 255, 255, 0.9);
  font-size: 20px;
  line-height: 1;
  font-weight: 500;
}

.channel-name {
  color: #f7fbff;
  font-size: 15px;
  line-height: 1;
  font-weight: 600;
}

.channel-separator {
  width: 1px;
  height: 16px;
  background: rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.channel-description {
  min-width: 0;
  color: #4a5568;
  font-size: 12px;
  font-weight: 400;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.icon-pill {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  padding: 0;
  display: grid;
  place-items: center;
  cursor: pointer;
  overflow: hidden;
  flex-shrink: 0;
}

.icon-pill.active {
  color: #a78bfa;
  border-color: rgba(124, 58, 237, 0.4);
  background: rgba(124, 58, 237, 0.16);
  box-shadow: 0 0 18px rgba(124, 58, 237, 0.14);
}

.members-toggle {
  width: auto;
  min-width: 32px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.members-count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

.logout-btn {
  height: 32px;
  padding: 0 12px;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: #8892a4;
  font-size: 12px;
  font-weight: 500;
  font-family: 'Inter', sans-serif;
}

@media (max-width: 767px) {
  .hamburger-btn {
    display: grid;
  }

  .topbar {
    padding: 0 12px;
    gap: 8px;
  }

  .left {
    gap: 8px;
  }

  .brand-name,
  .brand-separator {
    display: none;
  }

  .channel-name {
    font-size: 14px;
  }

  .channel-description,
  .logout-btn span {
    display: none;
  }

  .channel-line {
    gap: 8px;
  }

  .right {
    gap: 8px;
  }

  .members-toggle {
    padding: 0 8px;
    gap: 5px;
  }

  .members-count {
    font-size: 10px;
  }
}

/* parity overrides */
.topbar {
  padding: 0 20px;
  background: #0a0d1c;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.channel-icon {
  color: #4a5568;
  font-size: 16px;
}

.channel-name {
  font-size: 0.95rem;
}

.channel-description {
  color: #4a5568;
}

.icon-pill,
.chrome-btn {
  border-radius: 8px;
}

.logout-btn {
  border-radius: 8px;
}
</style>
