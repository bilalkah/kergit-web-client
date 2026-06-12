<script setup lang="ts">
import type { UseCaseItem } from './content'
import { accentPalette } from './content'
import LandingIcon from './Icon.vue'

const props = defineProps<{
  item: UseCaseItem
}>()
</script>

<template>
  <article class="use-case-card" :style="accentPalette[props.item.accent]">
    <span class="use-case-card__icon">
      <LandingIcon :name="props.item.icon" />
    </span>

    <h3>{{ props.item.title }}</h3>
    <p class="use-case-card__subtitle">{{ props.item.subtitle }}</p>
  </article>
</template>

<style scoped>
.use-case-card {
  border: 1px solid rgba(125, 146, 202, 0.12);
  border-radius: 26px;
  background:
    linear-gradient(180deg, rgba(8, 12, 32, 0.88), rgba(5, 8, 23, 0.84)),
    radial-gradient(circle at top left, var(--accent-soft), transparent 48%);
  padding: 1.5rem;
  transition:
    transform 220ms ease,
    border-color 220ms ease,
    box-shadow 220ms ease;
}

.use-case-card:hover {
  transform: translateY(-3px);
  border-color: var(--accent-border);
  box-shadow: 0 24px 60px -42px var(--accent-glow);
}

.use-case-card__icon {
  display: inline-flex;
  width: 2.55rem;
  height: 2.55rem;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  color: var(--accent);
  background: var(--accent-soft);
}

.use-case-card h3 {
  margin: 1.2rem 0 0;
  color: #f8fbff;
  font-family: 'Space Grotesk', 'Manrope', sans-serif;
  font-size: 1.45rem;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.use-case-card__subtitle {
  margin: 0.55rem 0 0;
  color: rgba(177, 186, 216, 0.72);
}
</style>
