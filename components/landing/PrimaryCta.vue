<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

const props = withDefaults(defineProps<{
  size?: 'sm' | 'md' | 'lg'
  guestLabel?: string
  authLabel?: string
}>(), {
  size: 'md',
  guestLabel: "Beta'ya Katıl",
  authLabel: 'Uygulamayı Aç',
})

const auth = useAuthStore()

const target = computed(() => auth.isAuthenticated ? '/app' : '/signup')
const label = computed(() => auth.isAuthenticated ? props.authLabel : props.guestLabel)
</script>

<template>
  <NuxtLink :to="target" class="primary-cta" :class="`primary-cta--${size}`">
    <span>{{ label }}</span>
  </NuxtLink>
</template>

<style scoped>
.primary-cta {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  overflow: hidden;
  border: 1px solid rgba(192, 132, 252, 0.28);
  border-radius: 16px;
  background:
    linear-gradient(135deg, rgba(124, 58, 237, 0.95), rgba(99, 102, 241, 0.92));
  color: #f8fafc;
  font-weight: 700;
  letter-spacing: -0.01em;
  box-shadow:
    0 14px 30px -18px rgba(139, 92, 246, 0.8),
    inset 0 1px 0 rgba(255, 255, 255, 0.14);
  transition:
    transform 160ms ease,
    box-shadow 160ms ease,
    filter 160ms ease;
}

.primary-cta::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, transparent 0%, rgba(255, 255, 255, 0.18) 45%, transparent 100%);
  transform: translateX(-140%);
  transition: transform 320ms ease;
}

.primary-cta:hover {
  transform: translateY(-1px);
  filter: saturate(1.1);
  box-shadow:
    0 20px 38px -20px rgba(139, 92, 246, 0.95),
    inset 0 1px 0 rgba(255, 255, 255, 0.16);
}

.primary-cta:hover::before {
  transform: translateX(140%);
}

.primary-cta--sm {
  min-width: 7.5rem;
  padding: 0.8rem 1.15rem;
  font-size: 0.9rem;
}

.primary-cta--md {
  min-width: 9rem;
  padding: 0.95rem 1.4rem;
  font-size: 0.95rem;
}

.primary-cta--lg {
  min-width: 10rem;
  padding: 1.1rem 1.65rem;
  font-size: 1rem;
}
</style>
