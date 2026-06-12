<script setup lang="ts">
import AuthPreview from './Preview.vue'
import appVersionRaw from '~/VERSION?raw'

const appVersion = appVersionRaw.trim()

withDefaults(defineProps<{
  eyebrow: string
  title: string
  description?: string
  backTo?: string
  backLabel?: string
  previewVariant?: 'login' | 'signup' | 'reset'
  showPreview?: boolean
}>(), {
  description: '',
  backTo: '/',
  backLabel: 'Ana sayfaya dön',
  previewVariant: 'login',
  showPreview: true,
})
</script>

<template>
  <div class="auth-shell">
    <div class="auth-shell__grid" :class="{ 'auth-shell__grid--single': !showPreview }">
      <section class="auth-shell__content" :class="{ 'auth-shell__content--single': !showPreview }">
        <div class="auth-shell__topbar">
          <NuxtLink to="/" class="auth-shell__brand">
            <img class="auth-shell__mark" src="/icon.png" alt="" />
            <span class="auth-shell__brand-copy">
              <span class="auth-shell__brand-name">Kergit</span>
              <span class="auth-shell__brand-badge">{{ appVersion }}</span>
            </span>
          </NuxtLink>

          <NuxtLink :to="backTo" class="auth-shell__back">
            <span aria-hidden="true">←</span>
            <span>{{ backLabel }}</span>
          </NuxtLink>
        </div>

        <div class="auth-shell__intro">
          <p class="auth-shell__eyebrow">{{ eyebrow }}</p>
          <h1 class="auth-shell__title">{{ title }}</h1>
          <p v-if="description" class="auth-shell__description">{{ description }}</p>
        </div>

        <div class="auth-shell__card">
          <slot />
        </div>
      </section>

      <aside v-if="showPreview" class="auth-shell__aside">
        <AuthPreview :variant="previewVariant" />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.auth-shell {
  position: relative;
  min-height: 100svh;
  overflow: hidden;
  background:
    radial-gradient(circle at 18% 18%, rgba(91, 88, 255, 0.18), transparent 26%),
    radial-gradient(circle at 82% 16%, rgba(34, 211, 238, 0.12), transparent 24%),
    radial-gradient(circle at 72% 78%, rgba(139, 92, 246, 0.12), transparent 26%),
    linear-gradient(180deg, #020617 0%, #03081a 42%, #020512 100%);
}

.auth-shell::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(88, 113, 187, 0.09) 1px, transparent 1px),
    linear-gradient(90deg, rgba(88, 113, 187, 0.09) 1px, transparent 1px);
  background-size: 44px 44px;
  opacity: 0.22;
  mask-image: radial-gradient(circle at center, rgba(0, 0, 0, 0.95), transparent 92%);
  pointer-events: none;
}

.auth-shell::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(3, 6, 18, 0.12), rgba(3, 6, 18, 0.5)),
    radial-gradient(circle at center, transparent 42%, rgba(2, 6, 23, 0.44) 100%);
  pointer-events: none;
}

.auth-shell__grid {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 2rem;
  max-width: 80rem;
  margin: 0 auto;
  padding: clamp(1.25rem, 3vw, 2.25rem);
}

.auth-shell__grid--single {
  max-width: 54rem;
}

.auth-shell__content {
  position: relative;
  display: grid;
  align-content: center;
  gap: 1.8rem;
  min-height: calc(100svh - 2.5rem);
}

.auth-shell__content--single {
  --auth-single-width: min(100%, 32rem);
  justify-items: center;
}

.auth-shell__content--single .auth-shell__topbar,
.auth-shell__content--single .auth-shell__intro,
.auth-shell__content--single .auth-shell__card {
  width: var(--auth-single-width);
}

.auth-shell__content--single .auth-shell__intro {
  max-width: var(--auth-single-width);
}

.auth-shell__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.8rem 0.95rem;
  border: 1px solid rgba(125, 146, 202, 0.14);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(8, 12, 32, 0.86), rgba(5, 8, 23, 0.78));
  backdrop-filter: blur(12px);
  box-shadow: 0 20px 60px -46px rgba(7, 10, 26, 0.9);
}

.auth-shell__brand {
  display: inline-flex;
  align-items: center;
  gap: 0.8rem;
}

.auth-shell__mark {
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  object-fit: contain;
  filter: drop-shadow(0 0 14px rgba(110, 119, 255, 0.3));
}

.auth-shell__brand-copy {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
}

.auth-shell__brand-name {
  color: #f8fbff;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.auth-shell__brand-badge {
  border: 1px solid rgba(139, 92, 246, 0.22);
  border-radius: 999px;
  padding: 0.22rem 0.48rem;
  color: #c4b5fd;
  background: rgba(139, 92, 246, 0.1);
  font-size: 0.63rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.auth-shell__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  min-height: 2.4rem;
  padding: 0 0.95rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.45);
  color: rgba(218, 226, 247, 0.86);
  font-size: 0.92rem;
  font-weight: 600;
  line-height: 1;
  transition:
    color 180ms ease,
    transform 180ms ease,
    border-color 180ms ease,
    background 180ms ease;
}

.auth-shell__back:hover {
  color: #f8fbff;
  transform: translateY(-1px);
  border-color: rgba(148, 163, 184, 0.34);
  background: rgba(15, 23, 42, 0.68);
}

.auth-shell__intro {
  max-width: 34rem;
}

.auth-shell__eyebrow {
  margin: 0;
  color: #8b5cf6;
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.auth-shell__title {
  margin: 1rem 0 0;
  color: #f8fbff;
  font-family: 'Space Grotesk', 'Manrope', sans-serif;
  font-size: clamp(2.65rem, 5.8vw, 4.6rem);
  font-weight: 700;
  letter-spacing: -0.065em;
  line-height: 0.94;
}

.auth-shell__description {
  margin: 1rem 0 0;
  color: rgba(186, 195, 223, 0.86);
  font-size: clamp(1rem, 1.5vw, 1.16rem);
  line-height: 1.8;
}

.auth-shell__card {
  position: relative;
  width: min(100%, 32rem);
  border: 1px solid rgba(125, 146, 202, 0.16);
  border-radius: 30px;
  background:
    linear-gradient(180deg, rgba(7, 11, 31, 0.92), rgba(4, 8, 24, 0.9)),
    radial-gradient(circle at top right, rgba(139, 92, 246, 0.12), transparent 42%);
  padding: 1.5rem;
  backdrop-filter: blur(18px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 34px 90px -54px rgba(15, 23, 42, 0.96),
    0 0 0 1px rgba(255, 255, 255, 0.01);
}

.auth-shell__card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    radial-gradient(circle at top left, rgba(34, 211, 238, 0.05), transparent 32%),
    radial-gradient(circle at bottom right, rgba(139, 92, 246, 0.08), transparent 28%);
  pointer-events: none;
}

.auth-shell__aside {
  position: relative;
  display: grid;
  align-content: center;
  min-height: 18rem;
}

@media (min-width: 1100px) {
  .auth-shell__grid {
    grid-template-columns: minmax(0, 1fr) minmax(24rem, 30rem);
    align-items: center;
  }

  .auth-shell__grid--single {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 1099px) {
  .auth-shell__content {
    min-height: auto;
  }

  .auth-shell__aside {
    order: 2;
  }
}

@media (max-width: 640px) {
  .auth-shell__topbar {
    flex-wrap: wrap;
    row-gap: 0.65rem;
  }

  .auth-shell__back {
    width: 100%;
  }

  .auth-shell__card {
    width: 100%;
    padding: 1.2rem;
    border-radius: 24px;
  }
}
</style>
