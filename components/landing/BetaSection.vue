<script setup lang="ts">
import { betaChecklist, betaPhases } from './content'
import LandingSectionHeading from './SectionHeading.vue'
</script>

<template>
  <section id="status" class="beta-section">
    <LandingSectionHeading
      eyebrow="Durum / Canlı Geliştirme"
      title="Şu anda beta aşamasında"
      centered
    />

    <div class="beta-section__timeline" aria-label="Beta yol haritası durumu">
      <div class="beta-section__track" />

      <div
        v-for="phase in betaPhases"
        :key="phase.phase"
        class="beta-section__phase"
        :class="{ 'beta-section__phase--active': phase.active }"
      >
        <span class="beta-section__node" />
        <span class="beta-section__phase-title">{{ phase.phase }}</span>
        <span class="beta-section__phase-label">{{ phase.label }}</span>
        <span class="beta-section__phase-subtitle">{{ phase.subtitle }}</span>
      </div>
    </div>

    <div class="beta-section__panel">
      <div class="beta-section__panel-top">
        <div>
          <p class="beta-section__panel-phase">Aşama 01</p>
          <h3>Kamera, ekran paylaşımı ve sesli iletişim aktif</h3>
        </div>
        <span class="beta-section__badge">Aktif</span>
      </div>

      <div class="beta-section__checklist">
        <div v-for="item in betaChecklist" :key="item" class="beta-section__check">
          <span class="beta-section__check-dot" />
          {{ item }}
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.beta-section {
  padding: 6rem 0 1rem;
}

.beta-section__timeline {
  position: relative;
  display: grid;
  gap: 2rem;
  margin-top: 3rem;
}

.beta-section__track {
  position: absolute;
  left: 0;
  right: 0;
  top: 0.65rem;
  height: 1px;
  background: linear-gradient(90deg, rgba(139, 92, 246, 0.75), rgba(96, 165, 250, 0.25), rgba(125, 146, 202, 0.08));
}

.beta-section__phase {
  position: relative;
  display: grid;
  gap: 0.2rem;
  color: rgba(125, 146, 202, 0.52);
  font-size: 0.78rem;
}

.beta-section__phase--active {
  color: #d8cbff;
}

.beta-section__node {
  display: inline-flex;
  width: 0.95rem;
  height: 0.95rem;
  border-radius: 999px;
  border: 1px solid rgba(125, 146, 202, 0.16);
  background: rgba(9, 16, 40, 0.92);
  box-shadow: 0 0 0 6px rgba(3, 6, 18, 0.9);
}

.beta-section__phase--active .beta-section__node {
  border-color: rgba(139, 92, 246, 0.35);
  background: #8b5cf6;
  box-shadow:
    0 0 0 8px rgba(3, 6, 18, 0.92),
    0 0 22px rgba(139, 92, 246, 0.48);
}

.beta-section__phase-title {
  margin-top: 0.65rem;
  font-weight: 700;
  color: inherit;
}

.beta-section__phase-label,
.beta-section__phase-subtitle {
  display: block;
  color: inherit;
}

.beta-section__panel {
  margin-top: 2.5rem;
  border: 1px solid rgba(139, 92, 246, 0.24);
  border-radius: 28px;
  background:
    linear-gradient(180deg, rgba(11, 14, 38, 0.94), rgba(6, 10, 28, 0.9)),
    radial-gradient(circle at top right, rgba(139, 92, 246, 0.12), transparent 48%);
  padding: 1.7rem;
  box-shadow: 0 30px 80px -56px rgba(7, 10, 24, 0.95);
}

.beta-section__panel-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.beta-section__panel-phase {
  margin: 0 0 0.5rem;
  color: #8b5cf6;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.beta-section__panel h3 {
  margin: 0;
  color: #f8fbff;
  font-family: 'Space Grotesk', 'Manrope', sans-serif;
  font-size: clamp(1.6rem, 3vw, 2.4rem);
  font-weight: 700;
  letter-spacing: -0.04em;
}

.beta-section__badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid rgba(139, 92, 246, 0.24);
  padding: 0.45rem 0.8rem;
  color: #c4b5fd;
  background: rgba(139, 92, 246, 0.1);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.beta-section__checklist {
  display: grid;
  gap: 0.9rem;
  margin-top: 1.8rem;
}

.beta-section__check {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  border: 1px solid rgba(125, 146, 202, 0.1);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  padding: 0.8rem 0.95rem;
  color: rgba(225, 231, 247, 0.88);
  font-size: 0.95rem;
}

.beta-section__check-dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 999px;
  background: #a78bfa;
  box-shadow: 0 0 14px rgba(139, 92, 246, 0.42);
  flex: 0 0 auto;
}

@media (min-width: 860px) {
  .beta-section__timeline {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .beta-section__checklist {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 859px) {
  .beta-section__timeline {
    width: fit-content;
    max-width: min(100%, 34rem);
    margin-inline: auto;
  }

  .beta-section__track {
    left: 0.9rem;
    right: auto;
    top: 0;
    bottom: 0;
    width: 1px;
    height: auto;
    transform: none;
    background: linear-gradient(180deg, rgba(139, 92, 246, 0.8), rgba(96, 165, 250, 0.22));
  }

  .beta-section__phase {
    width: min(100%, 32rem);
    padding-left: 2.4rem;
    justify-items: start;
    text-align: left;
  }

  .beta-section__node {
    position: absolute;
    left: 0.9rem;
    top: 0.05rem;
    transform: translateX(-50%);
  }
}
</style>
