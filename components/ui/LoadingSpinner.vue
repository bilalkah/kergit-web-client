<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    size?: number
    label?: string
  }>(),
  {
    size: 18,
    label: '',
  }
)
</script>

<template>
  <span class="ui-spinner-wrap">
    <span class="ui-spinner" :style="{
      width: `${props.size}px`,
      height: `${props.size}px`,
    }" />
    <span v-if="props.label" class="ui-spinner-label">{{ props.label }}</span>
  </span>
</template>

<style scoped>
.ui-spinner-wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.ui-spinner {
  border-radius: 999px;
  border: 2px solid rgba(136, 146, 164, 0.3);
  border-top-color: #22d3ee;
  animation: spin 0.8s linear infinite;
}

.ui-spinner-label {
  color: #c4ccd8;
  font-size: 12px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
