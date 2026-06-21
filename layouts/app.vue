<script setup lang="ts">
import AppLayout from '~/components/ui/AppLayout.vue'
import Sidebar from '~/components/ui/Sidebar.vue'
import ChatPanel from '~/components/ui/ChatPanel.vue'
import TopBar from '~/components/ui/TopBar.vue'
import UserList from '~/components/ui/UserList.vue'
import { useAppStore } from '~/stores/app'
import { useAuthStore } from '~/stores/auth'
import { SocketState, useWebSocket } from '~/composables/useWebSocket'
import VoiceGrid from '~/components/voice/VoiceGrid.vue'
import AppBootTransition from '~/components/transitions/AppBootTransition.vue'
import FadeSlide from '~/components/transitions/FadeSlide.vue'
import { useToast } from '~/composables/useToast'
import { teardownVoiceSync } from '@/src/services/webrtc/livekit'
import { devLog } from '@/src/utils/safeLogger'

const app = useAppStore()
const auth = useAuthStore()
const socket = useWebSocket()
const router = useRouter()
const route = useRoute()
const isMobileViewport = ref(false)
const isCompactViewport = ref(false)
const hasReachedReadyOnce = ref(false)
const hasHydrated = ref(false)

let touchStartX = 0
let touchStartY = 0
let touchTracking = false

function handleBeforeUnload() {
  teardownVoiceSync()
}

function syncViewportState() {
  if (!import.meta.client) return
  const viewportWidth = window.innerWidth
  isMobileViewport.value = viewportWidth <= 767
  isCompactViewport.value = viewportWidth <= 1023
  if (!isMobileViewport.value && app.mobilePanels.channelsOpen) {
    app.closeMobilePanels()
  }
  if (!isMobileViewport.value) {
    touchTracking = false
  }
}

function getMobileSidebarWidth() {
  if (!import.meta.client) return 0
  const sidebarEl = document.querySelector('.ui-sidebar') as HTMLElement | null
  if (sidebarEl) {
    const width = sidebarEl.getBoundingClientRect().width
    if (width > 0) return width
  }
  return Math.min(window.innerWidth * 0.8, 340)
}

function onShellTouchStart(event: TouchEvent) {
  if (!isMobileViewport.value) return
  if (event.touches.length !== 1) return
  const touch = event.touches[0]
  if (!touch) return
  touchStartX = touch.clientX
  touchStartY = touch.clientY
  touchTracking = true
}

function onShellTouchEnd(event: TouchEvent) {
  if (!touchTracking || !isMobileViewport.value) return
  touchTracking = false
  if (event.changedTouches.length !== 1) return

  const touch = event.changedTouches[0]
  if (!touch) return
  const diffX = touch.clientX - touchStartX
  const diffY = touch.clientY - touchStartY
  const absX = Math.abs(diffX)
  const absY = Math.abs(diffY)

  // Keep vertical scrolling intact by only handling clear horizontal swipes.
  if (absX < 56 || absX <= absY) return

  if (diffX > 0) {
    const startedNearLeftEdge = touchStartX <= 28
    if (startedNearLeftEdge && !app.mobilePanels.channelsOpen && !app.mobilePanels.membersOpen) {
      app.toggleChannelsPanel()
    }
    return
  }

  if (!app.mobilePanels.channelsOpen) return
  const startedInsideSidebar = touchStartX <= getMobileSidebarWidth() + 24
  if (startedInsideSidebar) {
    app.closeMobilePanels()
  }
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (app.mobilePanels.channelsOpen || app.mobilePanels.membersOpen || app.mobilePanels.voiceOpen) {
    app.closeMobilePanels()
  }
}

// Boot status message based on socket state
const bootStatus = computed(() => {
  if (!hasHydrated.value) return 'Yükleniyor...'
  if (!auth.isReady) return 'Oturum geri yükleniyor...'
  if (socket.state.value === SocketState.CONNECTING) return 'Bağlanıyor...'
  if (socket.state.value === SocketState.LOADING) return 'Çalışma alanı eşitleniyor...'
  return 'Yükleniyor...'
})

const showBootScreen = computed(() => {
  if (auth.loggingOut) return false
  if (!auth.isReady) return true
  if (!hasReachedReadyOnce.value &&
    (socket.state.value === SocketState.IDLE ||
      socket.state.value === SocketState.CONNECTING ||
      socket.state.value === SocketState.LOADING)
  ) return true
  return false
})

const showAppShell = computed(() => {
  if (!(auth.isAuthenticated || auth.loggingOut)) return false
  if (showBootScreen.value) return false
  return true
})

const isHomeRoute = computed(() => route.path === '/app')

const showMobilePanelScrim = computed(() => {
  if (isMobileViewport.value) {
    return app.mobilePanels.channelsOpen || (!isHomeRoute.value && app.mobilePanels.membersOpen)
  }
  if (isCompactViewport.value) {
    return !isHomeRoute.value && app.mobilePanels.membersOpen
  }
  return false
})

// Wait for auth init to complete, then connect
onMounted(async () => {
  hasHydrated.value = true
  syncViewportState()
  if (import.meta.client) {
    window.addEventListener('resize', syncViewportState)
    window.addEventListener('keydown', handleGlobalKeydown)
    window.addEventListener('beforeunload', handleBeforeUnload)
  }

  if (auth.initPromise) {
    await auth.initPromise
  }

  devLog('[layout:app] mounted, auth initialized')

  // Only connect if authenticated
  if (auth.isAuthenticated) {
    if (socket.state.value === SocketState.IDLE || socket.state.value === SocketState.ERROR) {
      socket.connect()
    }
  }
})

const showDisconnect = computed(() => {
  if (auth.loggingOut) return false
  const code = socket.lastClose.value?.code
  if (typeof code !== 'number') return false
  // Show disconnect screen only for real auth rejections (4400+).
  // Exclude transient 4400+ codes handled by reconnect:
  // - 4408 bootstrap_timeout (client-side timeout)
  // - 4402 auth_token_expired (reconnect refreshes the token; only a dead refresh
  //   token logs the user out, from within the reconnect path)
  // Code 1006 closes (idle timeout, TCP reset) are also transient and reconnect silently.
  return code >= 4400 && code !== 4408 && code !== 4402
})
const disconnectTitle = computed(() => {
  const reason = socket.lastClose.value?.reason
  const code = socket.lastClose.value?.code
  if (reason === 'bootstrap_timeout') return 'Başlatma zaman aşımı'
  if (reason === 'token_refresh_failed') return 'Oturum süresi doldu'
  if (reason === 'reauth_failed') return 'Oturum süresi doldu'
  // If server sent a custom reason, show "Disconnected"
  if (reason && reason.trim().length > 0) return 'Bağlantı kesildi'
  // Auth errors (4400+)
  if (typeof code === 'number' && code >= 4400) return 'Oturum sonlandı'
  return 'Bağlantı koptu'
})
const disconnectMessage = computed(() => {
  const reason = socket.lastClose.value?.reason
  if (reason === 'bootstrap_timeout') {
    return 'Çalışma alanı zamanında eşitlenemedi'
  }
  if (reason === 'token_refresh_failed' || reason === 'reauth_failed') {
    return 'Lütfen tekrar giriş yap'
  }
  // Show the actual server reason if provided
  if (reason && reason.trim().length > 0) {
    return reason.replaceAll('_', ' ')
  }
  return 'Lütfen tekrar giriş yap'
})
const isReconnecting = computed(() => {
  if (!auth.isAuthenticated) return false
  if (auth.loggingOut) return false  // Don't show reconnecting during logout
  if (socket.state.value === SocketState.READY) return false
  if (showDisconnect.value) return false
  // Only show reconnecting if there's an active reconnect countdown
  return socket.reconnectIn.value !== null
})
const redirectIn = ref(5)
let redirectTimer: number | null = null
let reconnectTimer: number | null = null

function clearRedirectTimer() {
  if (redirectTimer !== null) {
    clearInterval(redirectTimer)
    redirectTimer = null
  }
}

function clearReconnectTimer() {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

async function goLogin() {
  devLog('[layout:app] goLogin() invoked', {
    lastClose: socket.lastClose.value,
    socketState: socket.state.value,
    authReady: auth.isReady,
    isAuthenticated: auth.isAuthenticated
  })
  clearRedirectTimer()
  clearReconnectTimer()
  await auth.logoutWithTransition(router, async () => {
    socket.disconnect()
    app.clearAll()
  })
}

watch(showDisconnect, (visible) => {
  devLog('[layout:app] showDisconnect changed', {
    visible,
    lastClose: socket.lastClose.value,
    socketState: socket.state.value,
    isAuthenticated: auth.isAuthenticated
  })
  if (!visible) {
    clearRedirectTimer()
    return
  }
  redirectIn.value = 5
  clearRedirectTimer()
  if (typeof window === 'undefined') return
  redirectTimer = window.setInterval(() => {
    redirectIn.value -= 1
    if (redirectIn.value <= 0) {
      goLogin()
    }
  }, 1000)
})

// Silent reconnection — notify once per cycle via toast.
watch(isReconnecting, (reconnecting) => {
  if (!reconnecting) {
    clearReconnectTimer()
    return
  }
  useToast().show('Bağlantı yeniden kuruluyor...', 'info')
}, { immediate: true })

watch(
  () => socket.state.value,
  (nextState) => {
    if (nextState === SocketState.READY) {
      hasReachedReadyOnce.value = true
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  devLog('[layout:app] unmounted')
  if (import.meta.client) {
    window.removeEventListener('resize', syncViewportState)
    window.removeEventListener('keydown', handleGlobalKeydown)
    window.removeEventListener('beforeunload', handleBeforeUnload)
  }
  clearRedirectTimer()
  clearReconnectTimer()
  socket.disconnect()
})
</script>

<template>
  <div class="app-root">
    <AppBootTransition :visible="auth.loggingOut || showBootScreen" :variant="auth.loggingOut ? 'logout' : 'boot'"
      :status="auth.loggingOut ? '' : bootStatus" />

    <div v-if="showAppShell" class="app-shell" :class="{
      'desktop-members-collapsed': !app.desktopMembersOpen,
      'mobile-members-open': app.mobilePanels.membersOpen,
    }">
      <div class="app-glow" aria-hidden="true"></div>

      <FadeSlide :duration="250" :distance="12" mode="default">
        <div v-if="showDisconnect" class="loading-overlay disconnect-overlay">
          <div class="loading-card disconnect-card">
            <div class="disconnect-title">{{ disconnectTitle }}</div>
            <div class="loading-sub">{{ disconnectMessage }}</div>
            <div class="disconnect-count">{{ redirectIn }} sn içinde giriş ekranına dönülüyor</div>
            <button class="disconnect-btn" @click="goLogin">Tekrar giriş yap</button>
          </div>
        </div>
      </FadeSlide>

      <header class="ui-global-topbar">
        <TopBar />
      </header>

      <div class="ui-shell-body" @touchstart.passive="onShellTouchStart" @touchend.passive="onShellTouchEnd">
        <div v-if="showMobilePanelScrim" class="mobile-panel-scrim"
          :class="{ 'mobile-panel-scrim-visible': showMobilePanelScrim }" @click="app.closeMobilePanels()" />

        <AppLayout>
          <template #sidebar>
            <Sidebar />
          </template>

          <template #chat>
            <ChatPanel class="chat-panel" :show-topbar="false"
              :hide-input="app.viewingVoiceGrid && app.voiceConnectedByThisSession"
              :hide-typing="app.viewingVoiceGrid && app.voiceConnectedByThisSession">
              <VoiceGrid v-if="app.viewingVoiceGrid && app.voiceConnectedByThisSession" />
              <slot v-else />
            </ChatPanel>
          </template>

          <template #users>
            <aside v-if="!isHomeRoute" class="ui-members-panel right-panel mobile-members-panel"
              :class="{ 'ui-hidden': isCompactViewport ? !app.mobilePanels.membersOpen : !app.desktopMembersOpen }">
              <UserList :mobile-mode="true" @close="app.closeMobilePanels()" />
            </aside>
          </template>
        </AppLayout>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-root {
  width: 100%;
  height: 100%;
}

.app-shell {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #080b18;
  color: #f2f7ff;
}

.app-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background:
    radial-gradient(ellipse at 15% 50%, rgba(124, 58, 237, 0.04) 0%, transparent 50%),
    radial-gradient(ellipse at 85% 20%, rgba(14, 116, 144, 0.03) 0%, transparent 40%);
}

.app-shell> :not(.app-glow):not(.loading-overlay):not(.mobile-panel-scrim) {
  position: relative;
}

.ui-global-topbar {
  width: 100%;
  height: 56px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(10, 13, 28, 0.96);
}

.ui-shell-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.chat-panel {
  flex: 1;
  min-width: 0;
}

.right-panel {
  width: 280px;
  min-width: 280px;
  max-width: 280px;
  flex: 0 0 280px;
}

.right-panel.ui-hidden {
  width: 0;
  min-width: 0;
  max-width: 0;
  flex-basis: 0;
}

.mobile-panel-scrim {
  position: fixed;
  inset: 56px 0 0 0;
  z-index: 30;
  background: rgba(2, 6, 23, 0.52);
  backdrop-filter: blur(2px);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.mobile-panel-scrim.mobile-panel-scrim-visible {
  opacity: 1;
}

.mobile-members-panel {
  position: relative;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  background: radial-gradient(circle at 20% 20%, rgba(15, 23, 42, 0.7), rgba(2, 6, 23, 0.9));
  backdrop-filter: blur(6px);
}

.disconnect-overlay {
  background: radial-gradient(circle at 30% 20%, rgba(127, 29, 29, 0.5), rgba(2, 6, 23, 0.9));
}

.loading-card {
  display: grid;
  gap: 12px;
  justify-items: center;
  padding: 28px 32px;
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow: 0 10px 30px rgba(2, 6, 23, 0.5);
  min-width: 280px;
}

.disconnect-card {
  gap: 10px;
}

.disconnect-title {
  font-weight: 700;
  letter-spacing: 0.3px;
}

.disconnect-count {
  font-size: 12px;
  color: #cbd5f5;
}

.disconnect-btn {
  margin-top: 6px;
  border: none;
  border-radius: 999px;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 600;
  color: #fee2e2;
  background: rgba(239, 68, 68, 0.2);
  cursor: pointer;
}

.disconnect-btn:hover {
  background: rgba(239, 68, 68, 0.3);
}

.loading-sub {
  font-size: 12px;
  color: #94a3b8;
}

@media (max-width: 767px) {
  .app-shell {
    height: 100dvh;
  }

  .ui-shell-body :deep(.ui-sidebar) {
    width: min(80vw, 340px);
    max-width: min(80vw, 340px);
  }
}

@media (max-width: 1023px) {
  .mobile-members-panel {
    display: block;
    position: fixed;
    top: 56px;
    right: 0;
    bottom: 0;
    height: auto;
    width: min(80vw, 320px);
    min-width: 0;
    max-width: min(80vw, 320px);
    flex: none;
    overflow: hidden;
    transform: translateX(110%);
    opacity: 0;
    pointer-events: none;
    z-index: 40;
    transition: transform 0.24s ease, opacity 0.2s ease;
  }

  .mobile-members-panel :deep(.members-col) {
    height: 100%;
    min-height: 0;
  }

  .app-shell.mobile-members-open .mobile-members-panel {
    transform: translateX(0);
    opacity: 1;
    pointer-events: auto;
  }
}
</style>
