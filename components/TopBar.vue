<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

const auth = useAuthStore()
const ready = ref(false)

onMounted(async () => {
  // Wait for auth initialization to complete before showing buttons
  if (auth.initPromise) {
    await auth.initPromise
  }
  ready.value = true
})
</script>

<template>
  <div
    class="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
    <div class="flex items-center gap-2 sm:gap-3">
      <div
        class="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-xs sm:text-sm font-bold">
        SC
      </div>
      <div class="text-sm sm:text-base font-semibold text-slate-100">Kergit</div>
    </div>

    <div class="flex items-center gap-2">
      <!-- Wait for auth check to complete before showing any buttons -->
      <template v-if="ready">
        <!-- Show "Open App" when authenticated, otherwise show Login/Signup -->
        <template v-if="auth.isAuthenticated">
          <NuxtLink to="/app"
            class="rounded-full px-3 sm:px-5 py-2 text-xs sm:text-sm font-semibold bg-indigo-500 hover:bg-indigo-400 text-white">
            Kergit'i Aç
          </NuxtLink>
        </template>
        <template v-else>
          <NuxtLink to="/login"
            class="rounded-full px-3 sm:px-5 py-2 text-xs sm:text-sm font-semibold bg-white/10 hover:bg-white/15 border border-white/10">
            Giriş Yap
          </NuxtLink>
          <NuxtLink to="/signup"
            class="rounded-full px-3 sm:px-5 py-2 text-xs sm:text-sm font-semibold bg-indigo-500 hover:bg-indigo-400 text-white">
            Kayıt Ol
          </NuxtLink>
        </template>
      </template>
      <!-- Placeholder to maintain layout while loading -->
      <template v-else>
        <div class="h-9 w-32 rounded-full bg-white/5 animate-pulse"></div>
      </template>
    </div>
  </div>
</template>
