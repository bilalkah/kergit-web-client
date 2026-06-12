<script setup lang="ts">
import { accentPalette, whyItems } from './content'
import LandingIcon from './Icon.vue'
import LandingSectionHeading from './SectionHeading.vue'
</script>

<template>
  <section id="why" class="landing-section">
    <LandingSectionHeading
      eyebrow="Türkiye Odaklı"
      title="Türkiye için düşük ping, yüksek hız"
      description="Uygulamamız Türkiye için geliştirildi. Sunucular Türkiye'de konumlanır; bu sayede ping daha düşük, bağlantı daha hızlı ve ses daha kararlı olur."
      centered
    />

    <div class="feature-grid">
      <article
        v-for="item in whyItems"
        :key="item.title"
        class="feature-card"
        :style="accentPalette[item.accent]"
      >
        <span class="feature-card__icon">
          <LandingIcon :name="item.icon" />
        </span>
        <h3>{{ item.title }}</h3>
        <p>{{ item.description }}</p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.landing-section {
  padding: 2.5rem 0 1rem;
}

.feature-grid {
  display: grid;
  gap: 1.35rem;
  margin-top: 3rem;
}

.feature-card {
  position: relative;
  overflow: hidden;
  min-height: 15rem;
  border: 1px solid var(--accent-border);
  border-radius: 26px;
  background:
    linear-gradient(180deg, rgba(8, 12, 32, 0.9), rgba(5, 8, 23, 0.85)),
    radial-gradient(circle at top right, var(--accent-soft), transparent 48%);
  padding: 1.7rem;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.feature-card::after {
  content: '';
  position: absolute;
  inset: auto 1.7rem 1.2rem;
  height: 1px;
  background: linear-gradient(90deg, var(--accent), transparent 75%);
  opacity: 0.35;
}

.feature-card__icon {
  display: inline-flex;
  width: 2.7rem;
  height: 2.7rem;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  color: var(--accent);
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03);
}

.feature-card h3 {
  margin: 1.4rem 0 0;
  color: #f8fbff;
  font-family: 'Space Grotesk', 'Manrope', sans-serif;
  font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.feature-card p {
  margin: 0.95rem 0 0;
  color: rgba(177, 186, 216, 0.82);
  font-size: 1rem;
  line-height: 1.8;
}

@media (min-width: 900px) {
  .feature-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
