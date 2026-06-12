<script setup lang="ts">
import { IconScreenShare, IconMicMuted } from '~/components/icons/VoiceIcons'
import Tooltip from '~/components/ui/Tooltip.vue'

defineProps<{
  displayName: string
  isScreenShare: boolean
  isMuted: boolean
}>()
</script>

<template>
  <div class="tile-overlay">
    <Tooltip v-if="isScreenShare" content="Ekran Paylaşımı">
      <span class="tile-screen-icon">
        <IconScreenShare :size="14" />
      </span>
    </Tooltip>

    <span class="tile-name">{{ displayName }}</span>

    <Tooltip v-if="isMuted" content="Sessizde">
      <span class="tile-muted-icon">
        <IconMicMuted :size="14" />
      </span>
    </Tooltip>
  </div>
</template>

<style scoped>
.tile-overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.62));
}

.tile-name {
  min-width: 0;
  font-size: 13px;
  font-weight: 700;
  color: #f8fafc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile-screen-icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  color: var(--ui-accent-green, #34d399);
}

.tile-muted-icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  color: var(--ui-accent-red, #f87171);
}
</style>
