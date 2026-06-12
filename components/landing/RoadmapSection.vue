<script setup lang="ts">
import { accentPalette, roadmapMilestones } from './content'
import LandingIcon from './Icon.vue'
import LandingSectionHeading from './SectionHeading.vue'

const visible = ref<boolean[]>(roadmapMilestones.map((_, index) => index === 0))
const itemElements = ref<(HTMLElement | null)[]>([])

let observer: IntersectionObserver | null = null

function setItemRef(element: unknown, index: number) {
  itemElements.value[index] = element as HTMLElement | null
}

onMounted(() => {
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue

      const index = Number((entry.target as HTMLElement).dataset.index)
      if (!Number.isNaN(index)) {
        visible.value[index] = true
      }
    }
  }, {
    threshold: 0.24,
  })

  for (const element of itemElements.value) {
    if (element) observer.observe(element)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
})
</script>

<template>
  <section id="roadmap" class="roadmap-section">
    <LandingSectionHeading eyebrow="Ürün Evrimi" title="Yol Haritası" centered />

    <div class="roadmap-section__timeline">
      <div class="roadmap-section__line" />

      <article
        v-for="(milestone, index) in roadmapMilestones"
        :key="milestone.phase"
        :ref="(element) => setItemRef(element, index)"
        class="roadmap-entry"
        :class="[
          index % 2 === 0 ? 'roadmap-entry--left' : 'roadmap-entry--right',
          { 'roadmap-entry--visible': visible[index], 'roadmap-entry--active': milestone.status === 'active' },
        ]"
        :data-index="index"
      >
        <div class="roadmap-entry__card" :style="accentPalette[milestone.accent]">
          <div class="roadmap-entry__meta">
            <span class="roadmap-entry__phase">{{ milestone.phase }}</span>
            <span class="roadmap-entry__badge">{{ milestone.badge }}</span>
          </div>

          <div class="roadmap-entry__icon">
            <LandingIcon :name="milestone.icon" />
          </div>

          <h3>{{ milestone.title }}</h3>
          <p>{{ milestone.description }}</p>

          <div class="roadmap-entry__tags">
            <span v-for="tag in milestone.tags" :key="tag">{{ tag }}</span>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.roadmap-section {
  padding: 6rem 0 1rem;
}

.roadmap-section__timeline {
  position: relative;
  margin-top: 3rem;
}

.roadmap-section__line {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  background:
    linear-gradient(180deg, rgba(139, 92, 246, 0.85), rgba(96, 165, 250, 0.58), rgba(125, 146, 202, 0.12));
  box-shadow: 0 0 28px rgba(96, 165, 250, 0.12);
}

.roadmap-entry {
  position: relative;
  width: 100%;
  margin-bottom: 3rem;
  opacity: 0.35;
  transition:
    transform 520ms ease,
    opacity 520ms ease,
    filter 520ms ease;
}

.roadmap-entry::after {
  content: '';
  position: absolute;
  top: 2.25rem;
  left: 50%;
  width: 0.9rem;
  height: 0.9rem;
  transform: translateX(-50%);
  border-radius: 999px;
  border: 1px solid rgba(125, 146, 202, 0.18);
  background: rgba(4, 9, 24, 0.95);
  box-shadow: 0 0 0 0 rgba(139, 92, 246, 0);
  transition:
    border-color 320ms ease,
    box-shadow 320ms ease,
    background 320ms ease;
}

.roadmap-entry--visible {
  opacity: 1;
  filter: saturate(1.03);
}

.roadmap-entry--visible::after,
.roadmap-entry--active::after {
  border-color: rgba(139, 92, 246, 0.35);
  background: #8b5cf6;
  box-shadow:
    0 0 0 6px rgba(4, 9, 24, 0.95),
    0 0 20px rgba(139, 92, 246, 0.45);
}

.roadmap-entry__card {
  position: relative;
  overflow: hidden;
  width: min(100%, 28rem);
  border: 1px solid rgba(125, 146, 202, 0.12);
  border-radius: 26px;
  background:
    linear-gradient(180deg, rgba(8, 12, 32, 0.9), rgba(5, 8, 23, 0.85)),
    radial-gradient(circle at top right, var(--accent-soft), transparent 48%);
  padding: 1.5rem;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 30px 80px -60px rgba(5, 8, 23, 0.95);
}

.roadmap-entry__card::after {
  content: '';
  position: absolute;
  inset: auto 1.5rem 1.2rem;
  height: 1px;
  background: linear-gradient(90deg, var(--accent), transparent 80%);
  opacity: 0.28;
}

.roadmap-entry__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.roadmap-entry__phase {
  color: rgba(139, 151, 185, 0.72);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.roadmap-entry__badge {
  border: 1px solid rgba(125, 146, 202, 0.15);
  border-radius: 999px;
  padding: 0.35rem 0.65rem;
  color: rgba(177, 186, 216, 0.66);
  background: rgba(255, 255, 255, 0.03);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.roadmap-entry__icon {
  display: inline-flex;
  width: 2.7rem;
  height: 2.7rem;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  color: var(--accent);
  background: var(--accent-soft);
}

.roadmap-entry h3 {
  margin: 1.2rem 0 0;
  color: #f8fbff;
  font-family: 'Space Grotesk', 'Manrope', sans-serif;
  font-size: 1.9rem;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.roadmap-entry p {
  margin: 0.95rem 0 0;
  color: rgba(177, 186, 216, 0.78);
  font-size: 1rem;
  line-height: 1.8;
}

.roadmap-entry__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-top: 1.35rem;
}

.roadmap-entry__tags span {
  border: 1px solid rgba(125, 146, 202, 0.12);
  border-radius: 10px;
  padding: 0.35rem 0.55rem;
  color: rgba(177, 186, 216, 0.62);
  background: rgba(255, 255, 255, 0.02);
  font-size: 0.72rem;
  letter-spacing: 0.04em;
}

@media (min-width: 960px) {
  .roadmap-entry--left {
    display: flex;
    justify-content: flex-start;
    padding-right: calc(50% + 2.6rem);
    transform: translateX(-22px);
  }

  .roadmap-entry--right {
    display: flex;
    justify-content: flex-end;
    padding-left: calc(50% + 2.6rem);
    transform: translateX(22px);
  }

  .roadmap-entry--visible {
    transform: translateX(0);
  }
}

@media (max-width: 959px) {
  .roadmap-section__line {
    left: 0.9rem;
    transform: none;
  }

  .roadmap-entry {
    padding-left: 2.4rem;
    transform: translateY(20px);
  }

  .roadmap-entry--visible {
    transform: translateY(0);
  }

  .roadmap-entry::after {
    left: 0.9rem;
    transform: translateX(-50%);
  }

  .roadmap-entry__card {
    width: 100%;
  }
}
</style>
