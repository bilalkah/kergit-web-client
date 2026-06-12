<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    tone?: 'online' | 'idle' | 'offline' | 'error'
    size?: number
  }>(),
  {
    tone: 'online',
    size: 8,
  }
)

const colorByTone: Record<string, string> = {
  online: '#34d399',
  idle: '#fbbf24',
  offline: '#4a5568',
  error: '#f87171',
}
</script>

<template>
  <span class="ui-status-indicator" :style="{
    width: `${props.size}px`,
    height: `${props.size}px`,
    background: colorByTone[props.tone],
  }" />
</template>

<style scoped>
.ui-status-indicator {
  display: inline-block;
  border-radius: 999px;
}
</style>
