<script setup lang="ts">
import { accentPalette, valueItems } from './content'
import LandingIcon from './Icon.vue'
import LandingSectionHeading from './SectionHeading.vue'
</script>

<template>
  <section class="values-section">
    <LandingSectionHeading
      eyebrow="Değerler"
      title="Ödünsüz performans"
      description="Gizliliği önceliklendiriyoruz. Kötüye kullanımı engelliyoruz. Toplulukları koruyoruz."
      centered
    />

    <div class="values-section__grid">
      <article
        v-for="item in valueItems"
        :key="item.title"
        class="values-section__card"
        :style="accentPalette[item.accent]"
      >
        <span class="values-section__icon">
          <LandingIcon :name="item.icon" />
        </span>
        <h3>{{ item.title }}</h3>
        <p>{{ item.description }}</p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.values-section {
  padding: 6rem 0 1rem;
}

.values-section__grid {
  display: grid;
  gap: 1.35rem;
  margin-top: 3rem;
}

.values-section__card {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(125, 146, 202, 0.12);
  border-radius: 26px;
  background:
    linear-gradient(180deg, rgba(8, 12, 32, 0.88), rgba(5, 8, 23, 0.84)),
    radial-gradient(circle at top left, var(--accent-soft), transparent 48%);
  padding: 1.6rem;
}

.values-section__icon {
  display: inline-flex;
  width: 2.65rem;
  height: 2.65rem;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  color: var(--accent);
  background: var(--accent-soft);
}

.values-section__card h3 {
  margin: 1.25rem 0 0;
  color: #f8fbff;
  font-family: 'Space Grotesk', 'Manrope', sans-serif;
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.values-section__card p {
  margin: 0.8rem 0 0;
  color: rgba(177, 186, 216, 0.8);
  line-height: 1.85;
}

@media (min-width: 900px) {
  .values-section__grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
