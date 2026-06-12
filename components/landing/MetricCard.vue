<script setup lang="ts">
import type { Accent, IconName } from './content'
import { accentPalette } from './content'
import LandingIcon from './Icon.vue'

const props = withDefaults(
  defineProps<{
    title: string
    description: string
    value: string
    suffix?: string
    icon: IconName
    accent: Accent
  }>(),
  {
    suffix: '',
  }
)
</script>

<template>
  <article class="metric-card" :style="accentPalette[props.accent]">
    <span class="metric-card__icon">
      <LandingIcon :name="props.icon" />
    </span>

    <div class="metric-card__value">
      <span>{{ props.value }}</span>
      <small v-if="props.suffix">{{ props.suffix }}</small>
    </div>

    <h3>{{ props.title }}</h3>
    <p>{{ props.description }}</p>
  </article>
</template>

<style scoped>
.metric-card {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(125, 146, 202, 0.12);
  border-radius: 26px;
  background:
    linear-gradient(180deg, rgba(8, 12, 32, 0.88), rgba(5, 8, 23, 0.84)),
    radial-gradient(circle at top right, var(--accent-soft), transparent 48%);
  padding: 1.55rem;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.metric-card::after {
  content: '';
  position: absolute;
  inset: auto 1.55rem 1.25rem;
  height: 2px;
  background: linear-gradient(90deg, var(--accent), transparent 85%);
}

.metric-card__icon {
  display: inline-flex;
  width: 2.6rem;
  height: 2.6rem;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  color: var(--accent);
  background: var(--accent-soft);
}

.metric-card__value {
  display: flex;
  align-items: flex-end;
  gap: 0.25rem;
  margin-top: 1.3rem;
  color: var(--accent);
  font-family: 'Space Grotesk', 'Manrope', sans-serif;
  font-weight: 700;
  letter-spacing: -0.06em;
}

.metric-card__value span {
  font-size: clamp(2.7rem, 7vw, 3.8rem);
  line-height: 0.92;
}

.metric-card__value small {
  margin-bottom: 0.4rem;
  font-size: 1.25rem;
  letter-spacing: -0.04em;
}

.metric-card h3 {
  margin: 0.9rem 0 0;
  color: #f8fbff;
  font-family: 'Space Grotesk', 'Manrope', sans-serif;
  font-size: 1.55rem;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.metric-card p {
  margin: 0.7rem 0 1.5rem;
  color: rgba(177, 186, 216, 0.78);
  line-height: 1.7;
}
</style>
