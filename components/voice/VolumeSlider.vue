<script setup lang="ts">
import { VOLUME } from '@/src/types/voice'

defineProps<{
  modelValue: number
  label?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

function onInput(event: Event) {
  const target = event.target as HTMLInputElement
  const value = Math.max(VOLUME.MIN, Math.min(VOLUME.MAX, Number(target.value)))
  emit('update:modelValue', value)
}
</script>

<template>
  <div class="volume-field">
    <label v-if="label" class="volume-label">{{ label }}</label>
    <div class="volume-row">
      <input
        type="range"
        class="volume-range"
        :min="VOLUME.MIN"
        :max="VOLUME.MAX"
        step="1"
        :value="modelValue"
        @input="onInput"
      />
      <span class="volume-value">{{ modelValue }}%</span>
    </div>
  </div>
</template>

<style scoped>
.volume-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.volume-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #8892a4;
}

.volume-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.volume-range {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  outline: none;
}

.volume-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: #f8fafc;
  border: 1px solid rgba(15, 23, 42, 0.5);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  cursor: pointer;
}

.volume-range::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: #f8fafc;
  border: 1px solid rgba(15, 23, 42, 0.5);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  cursor: pointer;
}

.volume-value {
  width: 40px;
  text-align: right;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #94a3b8;
}
</style>
