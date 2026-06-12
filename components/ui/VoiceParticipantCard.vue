<script setup lang="ts">
import UserContextCard from '~/components/ui/UserContextCard.vue'

const props = defineProps<{
  userId: string
  hubId?: string | null
  channelId?: string | null
  position: { x: number; y: number }
}>()

const emit = defineEmits<{
  close: []
  'update-role': [{ userId: string; hubId: string; role: 'admin' | 'member' }]
  'kick-user': [{ userId: string; hubId: string }]
  'kick-user-from-voice': [{ userId: string; hubId: string; channelId: string }]
  'set-user-volume': [{ userId: string; volumePercent: number }]
}>()
</script>

<template>
  <UserContextCard mode="voice" :user-id="props.userId" :hub-id="props.hubId" :channel-id="props.channelId"
    :position="props.position" @close="emit('close')" @update-role="emit('update-role', $event)"
    @kick-user="emit('kick-user', $event)" @kick-user-from-voice="emit('kick-user-from-voice', $event)"
    @set-user-volume="emit('set-user-volume', $event)" />
</template>
