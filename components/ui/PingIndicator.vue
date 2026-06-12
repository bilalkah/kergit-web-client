<script setup lang="ts">
import Tooltip from '~/components/ui/Tooltip.vue'

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<{
  ping: number | null
  connected: boolean
  reconnecting: boolean
}>(), {
  connected: false,
  reconnecting: false,
})

const attrs = useAttrs()

const displayText = computed(() => {
  if (!props.connected) return '--'
  if (typeof props.ping === 'number' && Number.isFinite(props.ping)) {
    return `${Math.round(props.ping)}ms`
  }
  return '--'
})

const tooltipText = computed(() => {
  if (props.reconnecting) return 'Yeniden bağlanıyor...'
  if (props.connected) return 'Bağlandı'
  return 'Bağlantı kesildi'
})
</script>

<template>
  <Tooltip :content="tooltipText" placement="bottom" toggle-on-click>
    <div
      v-bind="attrs"
      class="ping-indicator"
      :class="{ disconnected: !props.connected, reconnecting: props.reconnecting }"
      role="status"
      aria-live="polite"
      :aria-label="tooltipText"
    >
      <span class="ping-dot" aria-hidden="true"></span>
      <span class="ping-text">{{ displayText }}</span>
    </div>
  </Tooltip>
</template>

<style scoped>
.ping-indicator {
  --ping-color: #22d3ee;

  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 12px;
  border-radius: 11px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(255, 255, 255, 0.04);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 8px 16px rgba(2, 6, 23, 0.25);
  cursor: pointer;
  user-select: none;
}

.ping-indicator::after {
  content: '';
  position: absolute;
  inset: 1px;
  border-radius: 10px;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0));
  opacity: 0.45;
}

.ping-dot {
  position: relative;
  z-index: 1;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--ping-color);
  box-shadow: 0 0 8px var(--ping-color);
  animation: ping-pulse 1.5s ease-in-out infinite;
}

.ping-text {
  position: relative;
  z-index: 1;
  min-width: 30px;
  display: inline-block;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  color: var(--ping-color);
}

.ping-indicator.disconnected {
  --ping-color: #f87171;
}

.ping-indicator.reconnecting .ping-dot {
  animation-duration: 0.8s;
}

@keyframes ping-pulse {
  0%,
  100% {
    opacity: 0.5;
    box-shadow: 0 0 4px var(--ping-color);
  }

  50% {
    opacity: 1;
    box-shadow: 0 0 10px var(--ping-color);
  }
}
</style>
