<script setup lang="ts">
import { IconClose } from '~/components/icons/Common'

const props = withDefaults(defineProps<{
  statusText: string
  latencyText: string
  channelName: string
  hubName?: string
  latencyMs?: number | null
  latencyColor?: string
  connecting?: boolean
  error?: boolean
}>(), {
  latencyColor: '#22d3ee',
  connecting: false,
  error: false,
  hubName: '',
  latencyMs: null,
})

const emit = defineEmits<{
  leave: []
}>()

const statusClass = computed(() => {
  if (props.error) return 'is-error'
  if (props.connecting) return 'is-connecting'
  return 'is-connected'
})

const signalLevel = computed(() => {
  if (props.error) return 0
  if (props.connecting) return 1
  const latency = props.latencyMs ?? null
  if (latency === null) return 2
  if (latency <= 20) return 3
  if (latency <= 45) return 2
  return 1
})
</script>

<template>
  <div class="voice-connection-card" role="region" aria-label="Ses bağlantısı">
    <div class="voice-connection-header">
      <div class="voice-connection-status">
        <span class="voice-status-icon" aria-hidden="true">🔊</span>
        <span class="voice-status-text" :class="statusClass">{{ props.statusText }}</span>
        <span v-if="!props.connecting && !props.error" class="voice-rtt" :style="{ color: props.latencyColor }">
          {{ props.latencyText }}
        </span>
      </div>
      <div class="voice-header-actions">
        <div class="voice-signal" aria-hidden="true">
          <span class="voice-signal-bar" :class="{ active: signalLevel >= 1 }"></span>
          <span class="voice-signal-bar" :class="{ active: signalLevel >= 2 }"></span>
          <span class="voice-signal-bar" :class="{ active: signalLevel >= 3 }"></span>
        </div>

        <button class="disconnect-btn" type="button" @click="emit('leave')" aria-label="Ses bağlantısından ayrıl">
          <IconClose :size="12" />
          <span class="voice-disconnect-label">Ayrıl</span>
        </button>
      </div>
    </div>

    <div class="voice-channel-label">
      #{{ props.channelName }} / {{ props.hubName || 'Sunucu' }}
    </div>
  </div>
</template>

<style scoped>
.voice-connection-card {
  width: 100%;
  min-width: 0;
  height: var(--ui-voice-card-h, 56px);
  min-height: var(--ui-voice-card-h, 56px);
  max-height: var(--ui-voice-card-h, 56px);
  box-sizing: border-box;
  padding: 6px 12px;
  border-radius: 0;
  border: 0;
  border-left: 2px solid #22d3ee;
  border-bottom: 1px solid rgba(34, 211, 238, 0.35);
  background: #101e38;
  box-shadow: inset 0 0 22px rgba(34, 211, 238, 0.12);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  overflow: hidden;
}

.voice-connection-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
}

.voice-connection-status {
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1 1 auto;
  gap: 8px;
}

.voice-status-icon {
  font-size: 13px;
  line-height: 1;
}

.voice-status-text {
  font-family: var(--ui-font-mono);
  font-size: 12px;
  line-height: 1.15;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.voice-status-text.is-connected {
  color: #34d399;
}

.voice-status-text.is-connecting {
  color: #fbbf24;
}

.voice-status-text.is-error {
  color: #f87171;
}

.voice-rtt {
  font-family: var(--ui-font-mono);
  font-size: 10px;
  line-height: 1.1;
  font-weight: 500;
  margin-left: 4px;
  flex-shrink: 0;
}

.voice-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-shrink: 0;
}

.voice-signal {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 12px;
}

.voice-signal-bar {
  width: 3px;
  height: 4px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.45);
}

.voice-signal-bar:nth-child(2) {
  height: 8px;
}

.voice-signal-bar:nth-child(3) {
  height: 12px;
}

.voice-signal-bar.active {
  background: #22d3ee;
  box-shadow: 0 0 10px rgba(34, 211, 238, 0.55);
}

.voice-channel-label {
  color: #94a3b8;
  font-family: var(--ui-font-mono);
  font-size: 11px;
  line-height: 1.15;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.disconnect-btn {
  height: 24px;
  max-width: 102px;
  border-radius: 999px;
  border: 1px solid rgba(248, 113, 113, 0.34);
  background: rgba(248, 113, 113, 0.14);
  color: #fda4af;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0 8px;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.disconnect-btn svg {
  width: 12px;
  height: 12px;
}

.disconnect-btn span {
  font-size: 10px;
  font-weight: 600;
}

.voice-disconnect-label {
  display: block;
  max-width: 56px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.disconnect-btn:hover {
  color: #fecaca;
  border-color: rgba(248, 113, 113, 0.5);
  background: rgba(248, 113, 113, 0.2);
}
</style>
