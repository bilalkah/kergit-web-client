<script setup lang="ts">
withDefaults(defineProps<{
  type?: 'button' | 'submit' | 'reset'
  loading?: boolean
  disabled?: boolean
  tone?: 'primary' | 'secondary'
}>(), {
  type: 'button',
  loading: false,
  disabled: false,
  tone: 'primary',
})
</script>

<template>
  <button :type="type" class="auth-button" :class="`auth-button--${tone}`" :disabled="disabled || loading">
    <span v-if="loading" class="auth-button__spinner" aria-hidden="true" />
    <span><slot /></span>
  </button>
</template>

<style scoped>
.auth-button {
  position: relative;
  display: inline-flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  border-radius: 16px;
  padding: 0.98rem 1.15rem;
  font-size: 0.96rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  transition:
    transform 220ms ease,
    box-shadow 220ms ease,
    border-color 220ms ease,
    background 220ms ease,
    opacity 220ms ease;
}

.auth-button:disabled {
  cursor: not-allowed;
  opacity: 0.72;
}

.auth-button--primary {
  border: 1px solid rgba(192, 132, 252, 0.28);
  background:
    linear-gradient(135deg, rgba(124, 58, 237, 0.96), rgba(59, 130, 246, 0.92));
  color: #f8fbff;
  box-shadow:
    0 18px 34px -20px rgba(139, 92, 246, 0.78),
    inset 0 1px 0 rgba(255, 255, 255, 0.14);
}

.auth-button--secondary {
  border: 1px solid rgba(125, 146, 202, 0.16);
  background: rgba(255, 255, 255, 0.03);
  color: #e5ecff;
}

.auth-button:not(:disabled):hover {
  transform: translateY(-1px);
}

.auth-button--primary:not(:disabled):hover {
  box-shadow:
    0 22px 40px -22px rgba(139, 92, 246, 0.9),
    inset 0 1px 0 rgba(255, 255, 255, 0.18);
}

.auth-button--secondary:not(:disabled):hover {
  border-color: rgba(96, 165, 250, 0.28);
  background: rgba(255, 255, 255, 0.05);
}

.auth-button__spinner {
  width: 0.95rem;
  height: 0.95rem;
  border: 2px solid rgba(255, 255, 255, 0.28);
  border-top-color: rgba(255, 255, 255, 0.9);
  border-radius: 999px;
  animation: authSpin 760ms linear infinite;
}

@keyframes authSpin {
  to {
    transform: rotate(360deg);
  }
}
</style>
