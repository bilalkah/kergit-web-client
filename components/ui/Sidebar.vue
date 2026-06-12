<script setup lang="ts">
import { useAppStore } from '~/stores/app'
import HubRail from '~/components/ui/HubRail.vue'
import HubSidebar from '~/components/ui/HubSidebar.vue'
import VoicePanel from '~/components/ui/VoicePanel.vue'
import UserDock from '~/components/ui/UserDock.vue'
import HubCreateJoinModal from './modals/HubCreateJoinModal.vue'

const app = useAppStore()
const route = useRoute()
const hubCreateJoinOpen = ref(false)
const isHomeRoute = computed(() => route.path === '/app')
</script>

<template>
  <aside
    class="ui-sidebar"
    :class="{ 'ui-sidebar-open': app.mobilePanels.channelsOpen, 'ui-sidebar-home': isHomeRoute }"
  >
    <div class="sidebar-main">
      <div class="ui-sidebar-rail">
        <HubRail @open-add-modal="hubCreateJoinOpen = true" />
      </div>

      <div v-if="!isHomeRoute" class="ui-sidebar-channels">
        <HubSidebar :mobile-mode="true" @close="app.closeMobilePanels()" />
      </div>
    </div>

    <div class="sidebar-bottom-dock">
      <VoicePanel />
      <UserDock />
    </div>
  </aside>

  <HubCreateJoinModal v-model="hubCreateJoinOpen" />
</template>
