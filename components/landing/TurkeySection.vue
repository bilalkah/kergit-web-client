<script setup lang="ts">
import { accentPalette, turkeyHighlights, turkeyNodes } from './content'
import LandingIcon from './Icon.vue'
import LandingSectionHeading from './SectionHeading.vue'
</script>

<template>
  <section class="turkey-section">
    <div class="turkey-section__copy">
      <LandingSectionHeading
        eyebrow="Yerel Öncelik"
        title="Türkiye İçin Üretildi"
        description="Şu anda aktif sunucumuz İstanbul'da. Düşük gecikme için yerel altyapı kullanıyoruz, diğer bölgeler de yakında eklenecek."
      />

      <div class="turkey-section__highlights">
        <article
          v-for="highlight in turkeyHighlights"
          :key="highlight.title"
          class="turkey-section__highlight"
          :style="accentPalette[highlight.accent]"
        >
          <span class="turkey-section__highlight-icon">
            <LandingIcon :name="highlight.icon" />
          </span>
          <div>
            <h3>{{ highlight.title }}</h3>
            <p>{{ highlight.description }}</p>
          </div>
        </article>
      </div>
    </div>

    <div class="turkey-section__panel">
      <div class="turkey-section__panel-head">Aktif Bölge</div>

      <div class="turkey-section__nodes">
        <article
          v-for="node in turkeyNodes"
          :key="node.city"
          class="turkey-section__node"
          :style="accentPalette[node.accent]"
        >
          <div class="turkey-section__node-row">
            <div class="turkey-section__node-city">
              <span class="turkey-section__node-dot" />
              {{ node.city }}
            </div>
            <div class="turkey-section__node-status">{{ node.status }}</div>
          </div>

          <div class="turkey-section__node-detail">{{ node.detail }}</div>
        </article>
      </div>

      <div class="turkey-section__panel-foot">Diğer bölgeler yakında eklenecek</div>
    </div>
  </section>
</template>

<style scoped>
.turkey-section {
  display: grid;
  gap: 2rem;
  align-items: center;
  padding: 6rem 0 1rem;
}

.turkey-section__highlights {
  display: grid;
  gap: 1rem;
  margin-top: 2rem;
}

.turkey-section__highlight {
  display: flex;
  align-items: flex-start;
  gap: 0.9rem;
}

.turkey-section__highlight-icon {
  display: inline-flex;
  width: 2.6rem;
  height: 2.6rem;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  color: var(--accent);
  background: var(--accent-soft);
  flex: 0 0 auto;
}

.turkey-section__highlight h3 {
  margin: 0;
  color: #f8fbff;
  font-family: 'Space Grotesk', 'Manrope', sans-serif;
  font-size: 1.3rem;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.turkey-section__highlight p {
  margin: 0.3rem 0 0;
  color: rgba(177, 186, 216, 0.76);
  line-height: 1.7;
}

.turkey-section__panel {
  border: 1px solid rgba(125, 146, 202, 0.12);
  border-radius: 28px;
  background:
    linear-gradient(180deg, rgba(8, 12, 32, 0.88), rgba(5, 8, 23, 0.84)),
    radial-gradient(circle at top right, rgba(139, 92, 246, 0.08), transparent 48%);
  padding: 1.5rem;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.turkey-section__panel-head,
.turkey-section__panel-foot {
  color: rgba(125, 146, 202, 0.62);
  font-family: 'Space Grotesk', 'Manrope', sans-serif;
  font-size: 0.86rem;
  letter-spacing: 0.04em;
}

.turkey-section__nodes {
  display: grid;
  gap: 1rem;
  margin-top: 1.4rem;
}

.turkey-section__node {
  border: 1px solid rgba(125, 146, 202, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.03);
  padding: 1rem;
}

.turkey-section__node-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.turkey-section__node-city {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  color: #f8fbff;
  font-family: 'Space Grotesk', 'Manrope', sans-serif;
  font-size: 1.05rem;
  font-weight: 700;
}

.turkey-section__node-dot {
  width: 0.52rem;
  height: 0.52rem;
  border-radius: 999px;
  background: var(--accent);
}

.turkey-section__node-status {
  color: var(--accent);
  font-weight: 700;
}

.turkey-section__node-detail {
  margin-top: 0.85rem;
  color: rgba(125, 146, 202, 0.62);
  font-size: 0.9rem;
}

.turkey-section__panel-foot {
  margin-top: 1.1rem;
  text-align: center;
}

@media (min-width: 1024px) {
  .turkey-section {
    grid-template-columns: minmax(0, 1fr) minmax(24rem, 29rem);
  }
}

</style>
