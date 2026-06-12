<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    isOwn?: boolean
    own?: boolean
  }>(),
  {
    isOwn: false,
    own: false,
  }
)

const resolvedOwn = computed(() => props.isOwn === true || props.own === true)
</script>

<template>
  <div class="ui-message-bubble" :class="{ own: resolvedOwn }">
    <slot />
  </div>
</template>

<style scoped>
.ui-message-bubble {
  display: inline-block;
  width: fit-content;
  max-width: 70%;
  padding: 10px 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: #c4ccd8;
  box-sizing: border-box;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.ui-message-bubble.own {
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.35), rgba(109, 40, 217, 0.25));
  border-color: rgba(124, 58, 237, 0.3);
  color: #e2d9f3;
}
</style>
