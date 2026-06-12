<script setup lang="ts">
import ChannelList from '~/components/ui/ChannelList.vue'

const props = defineProps<{
  mobileMode?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <div class="hub-sidebar">
    <ChannelList class="channel-area" :mobile-mode="props.mobileMode" @close="emit('close')" />
  </div>
</template>

<style scoped>
.hub-sidebar {
  display: flex;
  flex-direction: column;
  width: 100%;
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}

.channel-area {
  width: 100%;
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}

.hub-sidebar :deep(.channel-col) {
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}

.hub-sidebar :deep(.header) {
  flex-shrink: 0;
}

.hub-sidebar :deep(.channel-list) {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
}

@media (max-width: 1023px) {
  .hub-sidebar {
    min-width: 0;
  }
}
</style>
