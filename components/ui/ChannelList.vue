<script setup lang="ts">
import LegacyChannelList from '~/layouts/app/ChannelList.vue'

const props = defineProps<{
  mobileMode?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <LegacyChannelList :mobile-mode="props.mobileMode" @close="emit('close')" />
</template>
