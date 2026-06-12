<script setup lang="ts">
const props = defineProps<{
  label: string
}>()
</script>

<template>
  <div class="date-divider" role="separator" :aria-label="props.label">
    <span class="line"></span>
    <span class="date">{{ props.label }}</span>
    <span class="line"></span>
  </div>
</template>

<style scoped>
.date-divider {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 24px 0;
}

.line {
  flex: 1;
  height: 1px;
  background: rgba(255, 255, 255, 0.05);
}

.date {
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  color: #4a5568;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.08em;
}

@media (max-width: 1023px) {
  .date-divider {
    gap: 10px;
  }

  .date {
    padding: 5px 10px;
  }
}
</style>
