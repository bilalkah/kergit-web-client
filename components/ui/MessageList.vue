<script setup lang="ts">
import LegacyMessageList from '~/layouts/app/MessageList.vue'

defineOptions({
  inheritAttrs: false,
})

const attrs = useAttrs()
</script>

<template>
  <LegacyMessageList v-bind="attrs" />
</template>
