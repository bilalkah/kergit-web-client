<script setup lang="ts">
import { useAppStore, ChannelType } from '~/stores/app'
import { useWebSocket } from '~/composables/useWebSocket'
import { protoService } from '@/src/services/proto'
import { hubAvatarUrl } from '@/src/utils/avatar'

defineOptions({
  inheritAttrs: false,
})

const props = defineProps<{
  mobileMode?: boolean
  showMobileHeader?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const app = useAppStore()
const socket = useWebSocket()
const attrs = useAttrs()
const route = useRoute()

enum HubModalStep {
  Choose = 'choose',
  Create = 'create',
  Join = 'join',
}

const isModalOpen = ref(false)
const modalStep = ref<HubModalStep>(HubModalStep.Choose)
const inputValue = ref('')
const inputError = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const isSubmitting = ref(false)
const hubCreateType = ref(50)
const hubJoinType = ref(51)
const listRef = ref<HTMLElement | null>(null)

const hoveredHub = ref<{ name: string; top: number; left: number } | null>(null)
const isMobile = ref(false)
const showMobileHeader = computed(() =>
  props.mobileMode && props.showMobileHeader !== false && isMobile.value
)

const activeCommandType = computed(() => {
  if (modalStep.value === HubModalStep.Create) return hubCreateType.value
  if (modalStep.value === HubModalStep.Join) return hubJoinType.value
  return 0
})

const activeCommandError = computed(() => {
  const entry = app.commandErrors[activeCommandType.value]
  return entry ?? null
})

function onSelectHub(hubId: string) {
  const mobile = props.mobileMode && isMobile.value
  const hubPath = `/channels/${hubId}`
  const firstTextChannelId = (app.channelsByHub[hubId] ?? []).find(
    (channel) => channel.type === ChannelType.Text
  )?.id
  const targetPath = firstTextChannelId ? `/channels/${hubId}/${firstTextChannelId}` : hubPath
  const alreadyOnHubRoute =
    route.path === hubPath || route.path.startsWith(`${hubPath}/`)

  // If clicking a different hub, switch to it.
  if (app.viewedHubId !== hubId || !alreadyOnHubRoute) {
    void navigateTo(targetPath)
    if (mobile) {
      app.openChannelsPanel()
    }
    return
  }
  // On mobile, allow tapping the same hub to toggle the slide-in channel panel.
  if (mobile) {
    app.toggleChannelsPanel()
  }
}

function showHubTooltip(event: MouseEvent | FocusEvent, name: string) {
  const target = event.currentTarget as HTMLElement | null
  if (!target) return
  const rect = target.getBoundingClientRect()
  hoveredHub.value = {
    name,
    top: Math.round(rect.top + rect.height / 2),
    left: Math.round(rect.right + 12),
  }
}

function hideHubTooltip() {
  hoveredHub.value = null
}

function openModal(mode: HubModalStep.Create | HubModalStep.Join) {
  modalStep.value = HubModalStep.Choose
  inputValue.value = ''
  inputError.value = ''
  isSubmitting.value = false
  if (activeCommandType.value) {
    app.clearCommandError(activeCommandType.value)
  }
  isModalOpen.value = true
}

function selectStep(step: HubModalStep.Create | HubModalStep.Join) {
  modalStep.value = step
  inputValue.value = ''
  inputError.value = ''
  isSubmitting.value = false
  if (activeCommandType.value) {
    app.clearCommandError(activeCommandType.value)
  }
  void nextTick(() => {
    inputRef.value?.focus()
  })
}

function closeModal() {
  isModalOpen.value = false
  modalStep.value = HubModalStep.Choose
  inputValue.value = ''
  inputError.value = ''
  isSubmitting.value = false
  if (activeCommandType.value) {
    app.clearCommandError(activeCommandType.value)
  }
}

async function submitModal() {
  if (modalStep.value === HubModalStep.Choose) return
  const trimmed = inputValue.value.trim()
  if (!trimmed) {
    inputError.value = modalStep.value === HubModalStep.Create ? 'Sunucu adı gerekli' : 'Davet kodu gerekli'
    return
  }

  inputError.value = ''
  if (activeCommandType.value) {
    app.clearCommandError(activeCommandType.value)
  }
  isSubmitting.value = true
  if (modalStep.value === HubModalStep.Create) {
    await socket.createHub(trimmed)
  } else {
    await socket.joinHub(trimmed)
  }
}

function onModalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeModal()
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    if (!isSubmitting.value && modalStep.value !== HubModalStep.Choose) {
      void submitModal()
    }
  }
}

watch(activeCommandError, (err) => {
  if (!err) return
  inputError.value = err.message
  isSubmitting.value = false
})

watch(
  () => app.lastHubEventAt,
  (stamp) => {
    if (!stamp || !isModalOpen.value || !isSubmitting.value) return
    closeModal()
  }
)

onMounted(async () => {
  if (typeof window !== 'undefined') {
    const mq = window.matchMedia('(max-width: 1023px)')
    const update = () => {
      isMobile.value = mq.matches
    }
    update()
    mq.addEventListener('change', update)
    onBeforeUnmount(() => {
      mq.removeEventListener('change', update)
    })
  }
  const { EnvelopeType } = protoService
  hubCreateType.value = EnvelopeType.HUB_CREATE as number
  hubJoinType.value = EnvelopeType.HUB_JOIN as number
})
</script>

<template>
  <div class="hub-list-col" v-bind="attrs">
    <!-- Mobile Header -->
    <div v-if="showMobileHeader" class="mobile-header">
      <h3 class="mobile-title">Sunucular</h3>
      <button class="mobile-close" @click="emit('close')" aria-label="Kapat">×</button>
    </div>

    <NuxtLink to="/app" class="home-hub" aria-label="Ana sayfaya dön">
      <img class="home-icon" src="/icon.png" alt="" />
    </NuxtLink>

    <div class="actions">
      <button class="action-btn" title="Sunucu oluştur veya katıl" @click="openModal(HubModalStep.Create)">
        <span class="icon">+</span>
      </button>
    </div>

    <div class="list" ref="listRef" @scroll="hideHubTooltip">
      <button v-for="hub in app.hubs" :key="hub.id" class="hub" :class="{ active: hub.id === app.viewedHubId }"
        :title="hub.name" :aria-label="hub.name" @click="onSelectHub(hub.id)" @mouseenter="showHubTooltip($event, hub.name)"
        @mouseleave="hideHubTooltip" @focus="showHubTooltip($event, hub.name)" @blur="hideHubTooltip">
        <span class="hub-active-pill" aria-hidden="true"></span>
        <img class="hub-avatar" :src="hubAvatarUrl(hub.avatar_seed)" :alt="hub.name" />
      </button>
    </div>

    <div v-if="hoveredHub" role="tooltip" :style="{
      position: 'fixed',
      top: hoveredHub.top + 'px',
      left: hoveredHub.left + 'px',
      transform: 'translateY(-50%)',
      background: 'rgba(31, 35, 48, 0.98)',
      color: '#e5e7eb',
      fontSize: '12px',
      fontWeight: '600',
      padding: '6px 12px',
      borderRadius: '10px',
      border: '1px solid rgba(148, 163, 184, 0.18)',
      boxShadow: '0 10px 24px rgba(2, 6, 23, 0.45)',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
      zIndex: 9000,
    }">{{ hoveredHub.name }}</div>
  </div>

  <Teleport to="body">
    <div v-if="isModalOpen" class="hub-overlay" @keydown="onModalKeydown">
      <div class="hub-surface" @click="closeModal"></div>
      <div class="hub-card" role="dialog" aria-modal="true">
        <!-- Header -->
        <div class="hub-header-row">
          <div>
            <div class="hub-title">
              {{ modalStep === HubModalStep.Choose ? 'Sunucu Oluştur veya Katıl' : (modalStep === HubModalStep.Create ? 'Sunucu Oluştur' : 'Kodla Katıl') }}
            </div>
            <div class="hub-sub">
              {{
                modalStep === HubModalStep.Choose
                  ? 'Yeni bir sunucu başlat ya da davet kodu gir.'
                  : (modalStep === HubModalStep.Create
                    ? 'Kendi alanını oluştur.'
                    : 'Zaten davet kodun var mı?')
              }}
            </div>
          </div>
          <button class="hub-close" @click="closeModal" aria-label="Kapat">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="1" y1="1" x2="13" y2="13" />
              <line x1="13" y1="1" x2="1" y2="13" />
            </svg>
          </button>
        </div>

        <!-- Content -->
        <div class="hub-content">
          <div v-if="modalStep === HubModalStep.Choose" class="hub-options">
            <button class="hub-option create" @click="selectStep(HubModalStep.Create)">
              <div class="hub-option-icon create">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                  <rect x="2" y="2" width="14" height="14" rx="3" />
                  <line x1="9" y1="6" x2="9" y2="12" />
                  <line x1="6" y1="9" x2="12" y2="9" />
                </svg>
              </div>
              <div class="hub-option-text">
                <div class="hub-option-title">Yeni sunucu oluştur</div>
                <div class="hub-option-sub">Kendi alanınla başla</div>
              </div>
              <svg class="hub-option-arrow" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <path d="M5 3l4 4-4 4" />
              </svg>
            </button>
            <button class="hub-option join" @click="selectStep(HubModalStep.Join)">
              <div class="hub-option-icon join">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10 3H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
                  <path d="M14 3l1 1-5 5" />
                  <path d="M11 3h4v4" />
                </svg>
              </div>
              <div class="hub-option-text">
                <div class="hub-option-title">Kodla katıl</div>
                <div class="hub-option-sub">Zaten davet kodun var mı?</div>
              </div>
              <svg class="hub-option-arrow" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <path d="M5 3l4 4-4 4" />
              </svg>
            </button>
          </div>

          <div v-else-if="modalStep === HubModalStep.Create" class="hub-form">
            <div class="hub-field">
              <label class="hub-label" for="hub-name">SUNUCU ADI</label>
              <input id="hub-name" ref="inputRef" v-model="inputValue" class="hub-input" type="text" placeholder="Benim Sunucum" @keydown="onModalKeydown" />
            </div>
            <div v-if="inputError" class="hub-error">{{ inputError }}</div>
            <div class="hub-actions">
              <button class="hub-btn ghost" @click="modalStep = HubModalStep.Choose" :disabled="isSubmitting">Geri</button>
              <button class="hub-btn primary create" @click="submitModal" :disabled="isSubmitting || !inputValue.trim()">
                {{ isSubmitting ? 'Oluşturuluyor...' : 'Oluştur' }}
              </button>
            </div>
          </div>

          <div v-else class="hub-form">
            <div class="hub-field">
              <label class="hub-label" for="hub-code">DAVET KODU</label>
              <input id="hub-code" ref="inputRef" v-model="inputValue" class="hub-input mono" type="text" placeholder="/invite/abc123" @keydown="onModalKeydown" />
              <p class="hub-hint">Davet bağlantıları şu şekilde görünür: /invite/hYbMsd</p>
            </div>
            <div v-if="inputError" class="hub-error">{{ inputError }}</div>
            <div class="hub-actions">
              <button class="hub-btn ghost" @click="modalStep = HubModalStep.Choose" :disabled="isSubmitting">Geri</button>
              <button class="hub-btn primary join" @click="submitModal" :disabled="isSubmitting || !inputValue.trim()">
                {{ isSubmitting ? 'Katılınıyor...' : 'Katıl' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.hub-list-col {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px;
  gap: 16px;
  align-items: center;
}

/* Mobile Header */
.mobile-header {
  display: none;
  width: 100%;
  padding: 12px 16px;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 8px;
}

.mobile-title {
  font-size: 18px;
  font-weight: 700;
  color: #f8fafc;
  margin: 0;
}

.mobile-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.05);
  color: #f8fafc;
  font-size: 20px;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.mobile-close:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
}

@media (max-width: 1023px) {
  .mobile-header {
    display: flex;
  }

  .hub-list-col {
    padding: 8px 0;
    gap: 10px;
  }

  .actions {
    padding: 0;
  }

  .list {
    flex-direction: column;
    justify-content: flex-start;
    padding: 0;
    gap: 10px;
  }
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  align-items: center;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.action-btn {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.05);
  border: 1px dashed rgba(255, 255, 255, 0.3);
  color: #fff;
  display: grid;
  place-items: center;
  transition: all 0.2s;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: #fff;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  align-items: center;
  overflow-y: auto;
  padding-top: 12px;
  padding-bottom: 8px;
}

.hub {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  /* More subtle inactive */
  color: #94a3b8;
  font-weight: bold;
  font-size: 14px;
  display: grid;
  place-items: center;
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  /* Bouncy transition */
  position: relative;
  overflow: visible;
}

.hub-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scale(0.90);
  transform-origin: center;
}

.hub:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  border-radius: 16px;
  transform: translateY(-1px);
  box-shadow: 0 0 10px rgba(99, 102, 241, 0.3);
  /* Subtle glow */
}

.hub.active {
  /* VIBRANT GRADIENT */
  background: linear-gradient(135deg, #6366f1, #a855f7);
  color: #fff;
  border-radius: 16px;
  box-shadow: 0 0 15px rgba(168, 85, 247, 0.5);
  /* Purple glow */
}

.hub-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hub-surface {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
}

.hub-card {
  position: relative;
  z-index: 1;
  width: min(448px, 94vw);
  max-height: 90vh;
  overflow-y: auto;
  border-radius: 16px;
  background: #0d1020;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6);
}

.hub-header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 28px 28px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.hub-close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: #4a5568;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}

.hub-close:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.05);
}

.hub-content {
  padding: 28px;
}

@media (max-width: 1023px) {
  .hub-header-row {
    padding: 20px 20px 16px;
  }

  .hub-content {
    padding: 20px;
  }

  .hub-actions {
    flex-direction: column;
  }

  .hub-btn {
    width: 100%;
    text-align: center;
  }
}

.hub-title {
  font-family: 'Inter', sans-serif;
  font-weight: 700;
  font-size: 1.15rem;
  color: #fff;
}

.hub-sub {
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  color: #8892a4;
  margin-top: 4px;
  line-height: 1.4;
}

.hub-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hub-option {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  text-align: left;
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.15s;
}

.hub-option.create {
  background: rgba(124, 58, 237, 0.06);
  border: 1px solid rgba(124, 58, 237, 0.2);
}

.hub-option.join {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.hub-option:hover {
  border-color: rgba(124, 58, 237, 0.4);
}

.hub-option-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.hub-option-icon.create {
  background: rgba(124, 58, 237, 0.2);
  color: #a78bfa;
}

.hub-option-icon.join {
  background: rgba(34, 211, 238, 0.1);
  color: #22d3ee;
}

.hub-option-text {
  flex: 1;
  min-width: 0;
}

.hub-option-title {
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 14px;
  color: #fff;
}

.hub-option-sub {
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  color: #8892a4;
  margin-top: 2px;
}

.hub-option-arrow {
  color: #4a5568;
  flex-shrink: 0;
}

.hub-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.hub-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hub-label {
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 600;
  color: #8892a4;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hub-input {
  width: 100%;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px 16px;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  color: #fff;
  outline: none;
  transition: border-color 0.2s;
}

.hub-input::placeholder {
  color: #4a5568;
}

.hub-input:focus {
  border-color: rgba(124, 58, 237, 0.4);
}

.hub-input.mono {
  font-family: 'JetBrains Mono', monospace;
}

.hub-input.mono:focus {
  border-color: rgba(34, 211, 238, 0.4);
}

.hub-hint {
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  color: #4a5568;
  margin-top: 4px;
}

.hub-error {
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  color: #ef4444;
}

.hub-actions {
  display: flex;
  gap: 12px;
  padding-top: 8px;
}

.hub-btn {
  flex: 1;
  border: none;
  border-radius: 12px;
  padding: 10px 18px;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.hub-btn.ghost {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #8892a4;
}

.hub-btn.ghost:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.04);
}

.hub-btn.primary {
  color: #4a5568;
  background: rgba(255, 255, 255, 0.05);
}

.hub-btn.primary:not(:disabled) {
  color: #fff;
  font-weight: 600;
}

.hub-btn.primary.create:not(:disabled) {
  background: linear-gradient(135deg, #6d28d9, #7c3aed);
  box-shadow: 0 0 20px rgba(124, 58, 237, 0.35);
}

.hub-btn.primary.join:not(:disabled) {
  background: linear-gradient(135deg, #0e7490, #06b6d4);
  box-shadow: 0 0 20px rgba(34, 211, 238, 0.3);
}

.hub-btn:disabled {
  cursor: not-allowed;
}

.hub-list-col {
  padding: 10px 0 12px;
  gap: 14px;
  align-items: center;
  justify-content: flex-start;
}

.home-hub {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  box-shadow: 0 12px 30px rgba(72, 91, 255, 0.34);
  position: relative;
  overflow: hidden;
}

.home-hub::before {
  content: '';
  position: absolute;
  inset: 1px;
  border-radius: 13px;
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.home-icon {
  width: 34px;
  height: 34px;
  object-fit: contain;
  filter: drop-shadow(0 0 10px rgba(110, 119, 255, 0.32));
}

.list {
  flex: 0 1 auto;
  gap: 11px;
  padding-top: 0;
  padding-bottom: 0;
  max-height: calc(100% - 122px);
}

.hub {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  position: relative;
  overflow: visible;
  background: linear-gradient(180deg, rgba(11, 18, 39, 0.9), rgba(6, 11, 25, 0.92));
  border: 1px solid rgba(122, 140, 190, 0.12);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
  transition: border-color 0.24s ease, border-radius 0.24s ease, transform 0.24s ease, box-shadow 0.24s ease;
}

.hub-active-pill {
  position: absolute;
  left: -9px;
  top: 50%;
  width: 4px;
  height: 0;
  transform: translateY(-50%);
  border-radius: 0 999px 999px 0;
  background: #c6b8ff;
  opacity: 0;
  transition: height 0.2s ease, opacity 0.2s ease;
}

.hub-avatar {
  transform: scale(0.94);
}

.hub:hover {
  border-radius: 16px;
  border-color: rgba(101, 193, 255, 0.24);
  background: linear-gradient(180deg, rgba(18, 27, 58, 0.96), rgba(9, 15, 32, 0.96));
  box-shadow: 0 0 22px rgba(53, 121, 255, 0.18);
}

.hub.active {
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(121, 57, 246, 0.88), rgba(87, 53, 203, 0.9));
  border-color: rgba(171, 133, 255, 0.44);
  box-shadow: 0 0 24px rgba(101, 93, 255, 0.24);
}

.hub.active .hub-active-pill {
  height: 28px;
  opacity: 1;
}

.actions {
  margin-top: 0;
  padding-top: 0;
  padding-bottom: 0;
  border-bottom: 0;
  border-top: 0;
}

.action-btn {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  border-style: solid;
  border-color: rgba(52, 211, 153, 0.18);
  background: linear-gradient(180deg, rgba(8, 40, 42, 0.9), rgba(6, 26, 30, 0.96));
  color: #34d399;
}

.action-btn:hover {
  border-color: rgba(52, 211, 153, 0.28);
  background: linear-gradient(180deg, rgba(10, 58, 58, 0.92), rgba(7, 32, 34, 0.96));
  box-shadow: 0 0 18px rgba(52, 211, 153, 0.22);
}

/* parity overrides */
.hub-list-col {
  padding: 16px 0;
  gap: 14px;
}

.home-hub {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
  box-shadow: 0 0 20px rgba(109, 40, 217, 0.4);
}

.home-hub::before {
  border-radius: 15px;
}

.list {
  gap: 12px;
  max-height: calc(100% - 140px);
  padding-top: 12px;
}

.hub {
  width: 48px;
  height: 48px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: none;
}

.hub:hover {
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: none;
}

.hub.active {
  border-radius: 14px;
  border-color: rgba(167, 139, 250, 0.5);
  box-shadow: 0 0 20px rgba(124, 58, 237, 0.3);
}

.hub-active-pill {
  left: -10px;
  width: 4px;
  background: #a78bfa;
}

.hub.active .hub-active-pill {
  height: 32px;
  opacity: 1;
}

.actions {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}

.action-btn {
  width: 48px;
  height: 48px;
  border-radius: 24px;
  background: rgba(52, 211, 153, 0.08);
  border: 1px solid rgba(52, 211, 153, 0.15);
  color: #34d399;
}

.action-btn:hover {
  background: #10b981;
  color: #ffffff;
  border-color: transparent;
  box-shadow: none;
}
</style>
