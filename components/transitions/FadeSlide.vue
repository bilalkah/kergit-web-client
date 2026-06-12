<script setup lang="ts">
const props = withDefaults(defineProps<{
  duration?: number
  distance?: number
  mode?: 'out-in' | 'in-out' | 'default'
}>(), {
  duration: 200,
  distance: 8,
  mode: 'out-in',
})

const transitionStyle = computed(() => ({
  '--fade-slide-duration': `${props.duration}ms`,
  '--fade-slide-distance': `${props.distance}px`,
}))
</script>

<template>
  <Transition :name="'fade-slide'" :mode="mode === 'default' ? undefined : mode">
    <div v-bind="$attrs" :style="transitionStyle">
      <slot />
    </div>
  </Transition>
</template>

<style>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition:
    opacity var(--fade-slide-duration, 200ms) ease,
    transform var(--fade-slide-duration, 200ms) ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(var(--fade-slide-distance, 8px));
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(calc(-1 * var(--fade-slide-distance, 8px)));
}
</style>
