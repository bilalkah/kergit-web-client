<script setup lang="ts">
import Avatar from '~/components/ui/Avatar.vue'
import Tooltip from '~/components/ui/Tooltip.vue'
import { useAppStore, ChannelType } from '~/stores/app'
import { hubAvatarUrl } from '@/src/utils/avatar'

const emit = defineEmits<{
  'open-add-modal': []
}>()

const app = useAppStore()
const route = useRoute()

const activeHubId = computed(() => app.activeHubId)
const hubItems = computed(() => {
  if (app.hubs.length > 0) return app.hubs
  return app.viewedHub ? [app.viewedHub] : []
})

function goHome() {
  if (route.path !== '/app') {
    app.viewingVoiceGrid = false
    void navigateTo('/app')
  }
}

function openAddModal() {
  emit('open-add-modal')
}

function selectHub(hubId: string) {
  const hubPath = `/channels/${hubId}`
  const firstTextChannelId = (app.channelsByHub[hubId] ?? []).find(
    (channel) => channel.type === ChannelType.Text
  )?.id
  const targetPath = firstTextChannelId ? `/channels/${hubId}/${firstTextChannelId}` : hubPath
  const alreadyOnHub = route.path === hubPath || route.path.startsWith(`${hubPath}/`)
  if (!alreadyOnHub) {
    void navigateTo(targetPath)
  }
}
</script>

<template>
  <nav class="hub-rail" aria-label="Sunucu listesi">
    <div class="hub-rail-top">
      <button
        class="hub-rail-btn home-btn"
        :class="{ active: route.path === '/app' }"
        type="button"
        aria-label="Ana sayfaya git"
        @click="goHome"
      >
        <span class="hub-active-pill" aria-hidden="true"></span>
        <span class="hub-btn-glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path
              d="M3 10.6L12 3l9 7.6v9.4a1 1 0 0 1-1 1h-5.2a1 1 0 0 1-1-1v-5h-3.6v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"
              fill="currentColor"
            />
          </svg>
        </span>
      </button>

      <button
        class="hub-rail-btn add-btn"
        type="button"
        aria-label="Sunucu oluştur veya katıl"
        @click="openAddModal"
      >
        <span class="hub-btn-glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </span>
      </button>
    </div>

    <div class="hub-list" role="list">
      <Tooltip
        v-for="hub in hubItems"
        :key="hub.id"
        :content="hub.name"
        placement="right"
        full-width
      >
        <button
          class="hub-item"
          role="listitem"
          :class="{ active: hub.id === activeHubId }"
          type="button"
          :aria-label="hub.name"
          @click="selectHub(hub.id)"
        >
          <span class="hub-active-pill" aria-hidden="true"></span>
          <Avatar :src="hubAvatarUrl(hub.avatar_seed)" :alt="hub.name" :size="44" />
        </button>
      </Tooltip>
    </div>
  </nav>
</template>

<style scoped>
.hub-rail {
  width: var(--ui-hub-rail-w);
  min-width: var(--ui-hub-rail-w);
  max-width: var(--ui-hub-rail-w);
  flex-basis: var(--ui-hub-rail-w);
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--ui-bg-hub, #06090f);
  border-right: 0;
  padding: 10px 8px;
  gap: 12px;
  overflow: hidden;
}

.hub-rail-top {
  width: 100%;
  display: grid;
  gap: 10px;
  flex-shrink: 0;
}

.hub-rail-btn,
.hub-item {
  width: 100%;
  min-height: 54px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: #cbd5e1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 0;
  cursor: pointer;
}

.hub-rail-btn:hover,
.hub-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.hub-btn-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.15);
  background: rgba(148, 163, 184, 0.08);
}

.home-btn .hub-btn-glyph {
  color: #e2e8f0;
}

.add-btn .hub-btn-glyph {
  color: #4ade80;
  background: rgba(74, 222, 128, 0.1);
  border-color: rgba(74, 222, 128, 0.2);
}

.hub-btn-glyph svg {
  width: 18px;
  height: 18px;
}

.hub-list {
  width: 100%;
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 6px;
}

.hub-list::-webkit-scrollbar {
  width: 6px;
}

.hub-list::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.35);
  border-radius: 999px;
}

.hub-active-pill {
  position: absolute;
  left: -7px;
  top: 50%;
  transform: translateY(-50%) scaleY(0.45);
  transform-origin: center;
  width: 4px;
  height: 22px;
  border-radius: 999px;
  background: #f8fafc;
  opacity: 0;
  transition: opacity 120ms ease, transform 120ms ease;
}

.hub-item.active .hub-active-pill,
.hub-rail-btn.active .hub-active-pill {
  opacity: 1;
  transform: translateY(-50%) scaleY(1);
}

.hub-item.active,
.hub-rail-btn.active {
  background: rgba(124, 58, 237, 0.2);
}

@media (max-width: 1023px) {
  .hub-rail {
    padding: 10px 6px;
  }

  .hub-btn-glyph {
    width: 40px;
    height: 40px;
    font-size: 16px;
  }
}

</style>
