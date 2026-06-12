<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    width?: string
    height?: string
    radius?: string
  }>(),
  {
    width: '100%',
    height: '16px',
    radius: '8px',
  }
)
</script>

<template>
  <div
    class="ui-skeleton"
    :style="{
      width: props.width,
      height: props.height,
      borderRadius: props.radius,
    }"
    aria-hidden="true"
  ></div>
</template>

<style scoped>
.ui-skeleton {
  position: relative;
  overflow: hidden;
  background: rgba(148, 163, 184, 0.12);
}

.ui-skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.18) 50%,
    rgba(255, 255, 255, 0) 100%
  );
  animation: ui-skeleton-shimmer 1.4s infinite;
}

@keyframes ui-skeleton-shimmer {
  100% {
    transform: translateX(100%);
  }
}
</style>
