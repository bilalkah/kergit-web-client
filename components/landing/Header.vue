<script setup lang="ts">
import LandingPrimaryCta from './PrimaryCta.vue'
import appVersionRaw from '~/VERSION?raw'
import { useAuthStore } from '~/stores/auth'

const appVersion = appVersionRaw.trim()
const auth = useAuthStore()

const links = [
  { href: '#why', label: 'Neden' },
  { href: '#status', label: 'Durum' },
  { href: '#roadmap', label: 'Yol Haritası' },
  { href: '#performance', label: 'Performans' },
]
</script>

<template>
  <header class="landing-header">
    <div class="landing-header__bar">
      <NuxtLink to="/" class="landing-header__brand">
        <span class="landing-header__mark">
          <span class="landing-header__mark-core" />
        </span>
        <span class="landing-header__brand-copy">
          <span class="landing-header__brand-name">Kergit</span>
          <span class="landing-header__brand-badge">{{ appVersion }}</span>
        </span>
      </NuxtLink>

      <nav class="landing-header__nav" aria-label="Birincil">
        <a v-for="link in links" :key="link.href" :href="link.href">{{ link.label }}</a>
      </nav>

      <div class="landing-header__actions">
        <NuxtLink
          v-if="!auth.isAuthenticated"
          to="/login"
          class="landing-header__login"
        >
          Giriş Yap
        </NuxtLink>
        <LandingPrimaryCta size="sm" />
      </div>
    </div>
  </header>
</template>

<style scoped>
.landing-header {
  position: sticky;
  top: 0;
  z-index: 30;
  padding: 1rem clamp(1rem, 2vw, 2rem) 0;
}

.landing-header__bar {
  margin: 0 auto;
  display: flex;
  max-width: 78rem;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border: 1px solid rgba(125, 146, 202, 0.11);
  background:
    linear-gradient(180deg, rgba(8, 12, 32, 0.84), rgba(5, 8, 23, 0.74));
  backdrop-filter: blur(18px);
  border-radius: 20px;
  padding: 0.85rem 1rem;
  box-shadow: 0 24px 80px -48px rgba(7, 10, 26, 0.92);
}

.landing-header__brand {
  display: inline-flex;
  align-items: center;
  gap: 0.8rem;
  min-width: 0;
}

.landing-header__mark {
  position: relative;
  display: inline-flex;
  height: 1.8rem;
  width: 1.8rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.9rem;
  background:
    radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.45), transparent 45%),
    linear-gradient(135deg, rgba(96, 165, 250, 0.95), rgba(139, 92, 246, 0.95));
  box-shadow: 0 0 28px rgba(96, 165, 250, 0.18);
}

.landing-header__mark-core {
  height: 0.38rem;
  width: 0.38rem;
  border-radius: 999px;
  background: #f8fafc;
  opacity: 0.9;
}

.landing-header__brand-copy {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
}

.landing-header__brand-name {
  color: #f8fbff;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.landing-header__brand-badge {
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 999px;
  padding: 0.2rem 0.45rem;
  color: #bda4ff;
  background: rgba(139, 92, 246, 0.12);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.landing-header__nav {
  display: none;
  align-items: center;
  gap: 1.8rem;
}

.landing-header__nav a {
  color: rgba(177, 186, 216, 0.8);
  font-size: 0.95rem;
  font-weight: 600;
  transition: color 160ms ease;
}

.landing-header__nav a:hover {
  color: #f8fbff;
}

.landing-header__actions {
  --header-action-width: 7.6rem;
  --header-action-height: 2.6rem;

  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
}

.landing-header__login {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--header-action-width);
  min-width: var(--header-action-width);
  height: var(--header-action-height);
  min-height: var(--header-action-height);
  padding: 0;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 16px;
  color: rgba(226, 232, 240, 0.9);
  background: rgba(15, 23, 42, 0.52);
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1;
  transition: border-color 160ms ease, background 160ms ease, color 160ms ease;
}

.landing-header__login:hover {
  border-color: rgba(148, 163, 184, 0.38);
  background: rgba(15, 23, 42, 0.75);
  color: #f8fbff;
}

.landing-header__actions :deep(.primary-cta--sm) {
  width: var(--header-action-width);
  min-width: var(--header-action-width);
  height: var(--header-action-height);
  min-height: var(--header-action-height);
  padding: 0;
  border-radius: 16px;
  box-sizing: border-box;
}

@media (min-width: 960px) {
  .landing-header__nav {
    display: inline-flex;
  }
}

@media (max-width: 639px) {
  .landing-header__bar {
    padding-inline: 0.85rem;
  }

  .landing-header__brand-name {
    font-size: 0.95rem;
  }

  .landing-header__actions {
    gap: 0.5rem;
  }
}
</style>
