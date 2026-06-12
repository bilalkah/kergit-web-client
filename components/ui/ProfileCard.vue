<script setup lang="ts">
import UserContextCard from '~/components/ui/UserContextCard.vue'

const props = defineProps<{
  userId: string
  hubId?: string | null
  position: { x: number; y: number }
}>()

const emit = defineEmits<{
  close: []
  'update-role': [{ userId: string; hubId: string; role: 'admin' | 'member' }]
  'kick-user': [{ userId: string; hubId: string }]
  'kick-user-from-voice': [{ userId: string; hubId: string; channelId: string }]
}>()
</script>

<template>
  <UserContextCard
    mode="profile"
    :user-id="props.userId"
    :hub-id="props.hubId"
    :position="props.position"
    @close="emit('close')"
    @update-role="emit('update-role', $event)"
    @kick-user="emit('kick-user', $event)"
    @kick-user-from-voice="emit('kick-user-from-voice', $event)"
  />
</template>
