<script setup lang="ts">
defineProps<{
  eyebrow: string
  title: string
  description?: string
  centered?: boolean
}>()
</script>

<template>
  <header class="section-heading" :class="{ 'section-heading--centered': centered }">
    <p class="section-heading__eyebrow">{{ eyebrow }}</p>
    <h2 class="section-heading__title">{{ title }}</h2>
    <p v-if="description" class="section-heading__description">{{ description }}</p>
  </header>
</template>

<style scoped>
.section-heading {
  max-width: 42rem;
}

.section-heading--centered {
  margin-inline: auto;
  text-align: center;
}

.section-heading__eyebrow {
  margin: 0 0 0.85rem;
  color: #8b5cf6;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}

.section-heading__title {
  margin: 0;
  color: #f8fbff;
  font-family: 'Space Grotesk', 'Manrope', sans-serif;
  font-size: clamp(2rem, 4vw, 3.5rem);
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 0.96;
}

.section-heading__description {
  margin: 1.2rem 0 0;
  color: rgba(177, 186, 216, 0.86);
  font-size: clamp(1rem, 1.35vw, 1.18rem);
  line-height: 1.75;
}
</style>
