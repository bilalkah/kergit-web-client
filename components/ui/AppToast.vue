<script setup lang="ts">
import { useToast } from '~/composables/useToast'

const { toasts, remove } = useToast()
</script>

<template>
  <Teleport to="body">
    <div class="toast-container" aria-live="polite">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="toast-item"
          :class="`toast-${toast.type}`"
          @click="remove(toast.id)"
        >
          <span class="toast-message">{{ toast.message }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
  max-width: min(380px, calc(100vw - 32px));
}

.toast-item {
  pointer-events: auto;
  padding: 12px 16px;
  border-radius: var(--ui-radius-md, 12px);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  cursor: pointer;
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.toast-error {
  background: rgba(239, 68, 68, 0.18);
  color: var(--ui-accent-red, #f87171);
  border-color: rgba(239, 68, 68, 0.2);
}

.toast-info {
  background: rgba(34, 211, 238, 0.12);
  color: var(--ui-accent-cyan, #22d3ee);
  border-color: rgba(34, 211, 238, 0.15);
}

.toast-success {
  background: rgba(52, 211, 153, 0.12);
  color: var(--ui-accent-green, #34d399);
  border-color: rgba(52, 211, 153, 0.15);
}

.toast-message {
  display: block;
}

/* TransitionGroup animations */
.toast-enter-active {
  transition: all 220ms ease-out;
}

.toast-leave-active {
  transition: all 180ms ease-in;
}

.toast-move {
  transition: transform 200ms ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(40px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(40px);
}
</style>
