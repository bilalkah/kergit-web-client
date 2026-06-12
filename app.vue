<script setup lang="ts">
import AppToast from '~/components/ui/AppToast.vue'
</script>

<template>
  <div>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>

    <ClientOnly>
      <AppToast />
    </ClientOnly>
  </div>
</template>
