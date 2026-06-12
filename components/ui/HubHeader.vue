<script setup lang="ts">
import { useAppStore } from '~/stores/app'
import { canInvite as canInviteByRole } from '@/src/utils/hubRole'

const props = withDefaults(
  defineProps<{
    mobileMode?: boolean
  }>(),
  {
    mobileMode: false,
  }
)

const emit = defineEmits<{
  'invite-people': []
  'create-channel': []
  'hub-settings': []
  'leave-hub': []
  close: []
}>()

const app = useAppStore()

const rootRef = ref<HTMLElement | null>(null)
const menuOpen = ref(false)

const hubName = computed(() => app.viewedHub?.name?.trim() ?? 'Sunucu')
const hubRole = computed(() => {
  const selfId = app.userId
  if (selfId) {
    const selfMember = app.viewedMembers.find(member => member.user_id === selfId)
    if (selfMember?.role) return selfMember.role
  }
  return app.viewedHub?.role ?? 'member'
})

const isOwner = computed(() => hubRole.value === 'owner')
const isOwnerOrAdmin = computed(
  () => hubRole.value === 'owner' || hubRole.value === 'admin'
)

const canInvite = computed(() =>
  Boolean(app.viewedHubId) && canInviteByRole(hubRole.value)
)
const canLeave = computed(() => !isOwner.value && Boolean(app.viewedHubId))

function toggleMenu() {
  if (!app.viewedHub) return
  menuOpen.value = !menuOpen.value
}

function closeMenu() {
  menuOpen.value = false
}

function handleInvitePeople() {
  emit('invite-people')
  closeMenu()
}

function handleCreateChannel() {
  emit('create-channel')
  closeMenu()
}

function handleHubSettings() {
  emit('hub-settings')
  closeMenu()
}

function handleLeaveHub() {
  emit('leave-hub')
  closeMenu()
}

function onDocumentClick(event: MouseEvent) {
  if (!menuOpen.value) return
  const target = event.target as Node | null
  if (!target) return
  if (rootRef.value?.contains(target)) return
  closeMenu()
}

watch(
  () => app.viewedHubId,
  () => {
    closeMenu()
  }
)

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
})
</script>

<template>
  <div class="hub-header" ref="rootRef">
    <button
      class="hub-trigger"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="menuOpen ? 'true' : 'false'"
      @click="toggleMenu"
    >
      <span class="hub-name">{{ hubName }}</span>
      <span class="hub-caret" aria-hidden="true">▾</span>
    </button>

    <button
      v-if="props.mobileMode"
      class="mobile-close"
      type="button"
      aria-label="Kapat"
      @click="emit('close')"
    >
      ×
    </button>

    <div v-if="menuOpen" class="hub-menu" role="menu">
      <button
        v-if="canInvite"
        class="hub-menu-item"
        type="button"
        role="menuitem"
        @click="handleInvitePeople"
      >
        👥 Kişi Davet Et
      </button>
      <button
        v-if="isOwnerOrAdmin"
        class="hub-menu-item"
        type="button"
        role="menuitem"
        @click="handleCreateChannel"
      >
        ➕ Kanal Oluştur
      </button>
      <button
        v-if="isOwnerOrAdmin"
        class="hub-menu-item"
        type="button"
        role="menuitem"
        @click="handleHubSettings"
      >
        ⚙️ Sunucu Ayarları
      </button>
      <div
        v-if="isOwnerOrAdmin && canLeave"
        class="hub-menu-divider"
        aria-hidden="true"
      ></div>
      <button
        v-if="canLeave"
        class="hub-menu-item danger"
        type="button"
        role="menuitem"
        @click="handleLeaveHub"
      >
        🚪 Sunucudan Ayrıl
      </button>
    </div>
  </div>
</template>

<style scoped>
.hub-header {
  height: var(--ui-sidebar-header-h, 56px);
  min-height: var(--ui-sidebar-header-h, 56px);
  padding: 0 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  background: transparent;
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  min-width: 0;
}

.hub-trigger {
  width: auto;
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  border: 0;
  background: transparent;
  border-radius: 0;
  justify-content: space-between;
  padding: 0;
  color: #f9fbff;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.hub-trigger:hover .hub-name {
  color: #ffffff;
}

.hub-name {
  display: block;
  flex: 1 1 auto;
  min-width: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: #ffffff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hub-caret {
  color: rgba(255, 255, 255, 0.4);
  font-size: 12px;
  flex-shrink: 0;
}

.mobile-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.05);
  color: #f8fafc;
  font-size: 20px;
  display: none;
  place-items: center;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-left: auto;
}

.mobile-close:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
}

.hub-menu {
  position: absolute;
  top: 52px;
  left: 12px;
  min-width: 220px;
  background: #0d1020;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6);
  z-index: 20;
}

.hub-menu-item {
  padding: 12px 14px;
  border: none;
  background: transparent;
  color: #fff;
  text-align: left;
  border-radius: 10px;
  cursor: pointer;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.15s;
}

.hub-menu-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.hub-menu-item.danger {
  color: #ef4444;
}

.hub-menu-item.danger:hover {
  background: rgba(239, 68, 68, 0.08);
}

.hub-menu-divider {
  height: 1px;
  margin: 4px 6px;
  background: rgba(255, 255, 255, 0.08);
}

@media (max-width: 1023px) {
  .hub-header {
    padding-inline: 12px;
  }

  .mobile-close {
    display: grid;
  }
}
</style>
