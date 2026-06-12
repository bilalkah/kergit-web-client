<script setup lang="ts">
// Redirect unknown routes to home to avoid router warnings.
await navigateTo('/', { replace: true })
</script>

<template>
  <div></div>
</template>
