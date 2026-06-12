<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    src: string
    alt: string
    size?: number
    speaking?: boolean
  }>(),
  {
    size: 32,
    speaking: false,
  }
)

const failed = ref(false)

const sizePx = computed(() => `${props.size}px`)

const fallbackLabel = computed(() => {
  const normalized = (props.alt ?? '').trim()
  return normalized.length > 0 ? normalized.charAt(0).toUpperCase() : '?'
})

const showFallback = computed(() => failed.value || !props.src?.trim())

watch(
  () => props.src,
  () => {
    failed.value = false
  }
)
</script>

<template>
  <div
    class="ui-avatar-wrap"
    :class="{ speaking: props.speaking }"
    :style="{ width: sizePx, height: sizePx }"
    :aria-label="props.alt"
  >
    <img
      v-if="!showFallback"
      class="ui-avatar"
      :src="props.src"
      :alt="props.alt"
      :style="{ width: sizePx, height: sizePx }"
      @error="failed = true"
    />
    <span v-else class="ui-avatar-fallback" aria-hidden="true">{{ fallbackLabel }}</span>
  </div>
</template>

<style scoped>
.ui-avatar-wrap {
  position: relative;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: linear-gradient(140deg, #1f2a44 0%, #25314d 100%);
}

.ui-avatar-wrap::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 999px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.16s ease;
}

.ui-avatar-wrap.speaking::after {
  opacity: 1;
  box-shadow: inset 0 0 0 2px #22c55e, inset 0 0 8px rgba(34, 197, 94, 0.45);
}

.ui-avatar {
  border-radius: 999px;
  display: block;
  object-fit: cover;
}

.ui-avatar-fallback {
  width: 100%;
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #dbe7ff;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}
</style>
