<script setup lang="ts">
withDefaults(defineProps<{
  tone?: 'error' | 'success' | 'info'
  title?: string
}>(), {
  tone: 'info',
  title: '',
})
</script>

<template>
  <div class="auth-alert" :class="`auth-alert--${tone}`">
    <div class="auth-alert__dot" aria-hidden="true" />
    <div class="auth-alert__copy">
      <p v-if="title" class="auth-alert__title">{{ title }}</p>
      <p class="auth-alert__text"><slot /></p>
    </div>
  </div>
</template>

<style scoped>
.auth-alert {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.8rem;
  align-items: flex-start;
  border: 1px solid rgba(125, 146, 202, 0.12);
  border-radius: 18px;
  padding: 0.95rem 1rem;
  background: rgba(255, 255, 255, 0.03);
}

.auth-alert__dot {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 999px;
  margin-top: 0.35rem;
}

.auth-alert__copy {
  min-width: 0;
}

.auth-alert__title {
  margin: 0;
  color: #f8fbff;
  font-size: 0.92rem;
  font-weight: 700;
}

.auth-alert__text {
  margin: 0;
  color: rgba(226, 232, 250, 0.84);
  font-size: 0.92rem;
  line-height: 1.7;
}

.auth-alert--error {
  border-color: rgba(248, 113, 113, 0.18);
  background: rgba(248, 113, 113, 0.08);
}

.auth-alert--error .auth-alert__dot {
  background: #fb7185;
  box-shadow: 0 0 14px rgba(251, 113, 133, 0.45);
}

.auth-alert--success {
  border-color: rgba(16, 185, 129, 0.18);
  background: rgba(16, 185, 129, 0.08);
}

.auth-alert--success .auth-alert__dot {
  background: #34d399;
  box-shadow: 0 0 14px rgba(52, 211, 153, 0.48);
}

.auth-alert--info {
  border-color: rgba(34, 211, 238, 0.16);
  background: rgba(34, 211, 238, 0.06);
}

.auth-alert--info .auth-alert__dot {
  background: #22d3ee;
  box-shadow: 0 0 14px rgba(34, 211, 238, 0.42);
}
</style>
