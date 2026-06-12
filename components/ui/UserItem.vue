<script setup lang="ts">
const props = defineProps<{
  userId?: string
}>()

const emit = defineEmits<{
  'show-profile': [{ userId: string; x: number; y: number }]
  'show-context': [{ userId: string; x: number; y: number }]
}>()

function onClick(event: MouseEvent) {
  if (!props.userId) return
  emit('show-profile', {
    userId: props.userId,
    x: event.clientX,
    y: event.clientY,
  })
}

function onKeydown(event: KeyboardEvent) {
  if (!props.userId) return
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  emit('show-profile', {
    userId: props.userId,
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  })
}

function onContextMenu(event: MouseEvent) {
  if (!props.userId) return
  event.preventDefault()
  emit('show-context', {
    userId: props.userId,
    x: event.clientX,
    y: event.clientY,
  })
}
</script>

<template>
  <div class="ui-user-item" :class="{ interactive: Boolean(props.userId) }" :role="props.userId ? 'button' : undefined"
    :tabindex="props.userId ? 0 : undefined" :aria-label="props.userId ? 'Kullanıcı profilini aç' : undefined"
    @click="onClick" @keydown="onKeydown" @contextmenu="onContextMenu">
    <slot />
  </div>
</template>

<style scoped>
.ui-user-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 8px;
}

.ui-user-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.ui-user-item.interactive {
  cursor: pointer;
}
</style>
