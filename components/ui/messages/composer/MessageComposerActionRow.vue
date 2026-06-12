<script setup lang="ts">
import { computed } from 'vue'
import { ChatComposerActionKind } from '@/src/features/messages/types'

const props = withDefaults(defineProps<{
  actionKind: ChatComposerActionKind
  disabled?: boolean
  canSend?: boolean
  isSending?: boolean
}>(), {
  disabled: false,
  canSend: false,
  isSending: false,
})

defineEmits<{
  (event: 'attach'): void
  (event: 'send'): void
}>()

const isAttachAction = computed(() => props.actionKind === ChatComposerActionKind.Attach)
const isSendAction = computed(() => props.actionKind === ChatComposerActionKind.Send)
const sendButtonDisabled = computed(() => props.disabled || !props.canSend || props.isSending)
</script>

<template>
  <div class="composer-action">
    <button
      v-if="isAttachAction"
      class="composer-action__attach"
      type="button"
      :disabled="props.disabled"
      aria-label="Dosya ekle"
      @click="$emit('attach')"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M21 11.5L12.5 20a5 5 0 0 1-7-7L14 4.5a3.5 3.5 0 0 1 5 5l-8.6 8.6a2 2 0 0 1-2.8-2.8l7.4-7.4"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.8"
        />
      </svg>
    </button>

    <button
      v-else-if="isSendAction"
      class="composer-action__send"
      type="button"
      :disabled="sendButtonDisabled"
      :aria-busy="props.isSending ? 'true' : 'false'"
      @click="$emit('send')"
    >
      {{ props.isSending ? 'GÖNDERİLİYOR' : 'GÖNDER' }}
    </button>
  </div>
</template>

<style scoped>
.composer-action {
  display: inline-grid;
  align-items: center;
  justify-items: center;
}

.composer-action__attach {
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  color: #72809a;
  display: grid;
  place-items: center;
  border-radius: 8px;
  cursor: pointer;
  transition: color 0.18s ease, background-color 0.18s ease;
}

.composer-action__attach:hover:not(:disabled) {
  color: #b3c3df;
  background: rgba(148, 163, 184, 0.12);
}

.composer-action__attach:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.composer-action__attach svg {
  width: 18px;
  height: 18px;
}

.composer-action__send {
  height: 30px;
  padding: 0 14px;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(255, 255, 255, 0.05);
  color: #6f7d96;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  font-family: var(--ui-font-sans);
  cursor: pointer;
  transition: transform 0.16s ease, box-shadow 0.16s ease, opacity 0.16s ease;
}

.composer-action__send:not(:disabled) {
  color: #ffffff;
  border-color: rgba(124, 58, 237, 0.48);
  background: linear-gradient(135deg, #6d28d9, #7c3aed);
  box-shadow: 0 0 14px rgba(124, 58, 237, 0.32);
}

.composer-action__send:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(124, 58, 237, 0.35);
}

.composer-action__send:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}
</style>
