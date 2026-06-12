<script setup lang="ts">
import { useCases } from './content'
import LandingSectionHeading from './SectionHeading.vue'
import LandingUseCaseCard from './UseCaseCard.vue'
</script>

<template>
  <section class="use-cases-section">
    <LandingSectionHeading eyebrow="Kullanım Alanları" title="Her Yerde Kullanın" centered />

    <div class="use-cases-section__grid">
      <LandingUseCaseCard
        v-for="item in useCases"
        :key="item.title"
        :item="item"
      />
    </div>
  </section>
</template>

<style scoped>
.use-cases-section {
  padding: 6rem 0 1rem;
}

.use-cases-section__grid {
  display: grid;
  gap: 1.35rem;
  margin-top: 3rem;
}

@media (min-width: 900px) {
  .use-cases-section__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1200px) {
  .use-cases-section__grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>
