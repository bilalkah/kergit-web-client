<script setup lang="ts">
const props = withDefaults(defineProps<{
  duration?: number
}>(), {
  duration: 280,
})

const overlayStyle = computed(() => ({
  '--scale-overlay-duration': `${props.duration}ms`,
}))
</script>

<template>
  <Transition name="scale-overlay" appear>
    <div v-bind="$attrs" :style="overlayStyle">
      <slot />
    </div>
  </Transition>
</template>

<style>
.scale-overlay-enter-active,
.scale-overlay-leave-active {
  transition:
    opacity var(--scale-overlay-duration, 280ms) ease,
    transform var(--scale-overlay-duration, 280ms) ease;
}

.scale-overlay-enter-from {
  opacity: 0;
  transform: scale(1.02);
}

.scale-overlay-leave-to {
  opacity: 0;
  transform: scale(0.98);
}
</style>
