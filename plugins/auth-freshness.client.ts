import type { Pinia } from 'pinia'
import type { Router } from 'vue-router'
import { watch } from 'vue'
import { createAuthFreshnessController } from '@/src/services/auth/freshnessController'
import { useAuthStore } from '~/stores/auth'

export default defineNuxtPlugin((nuxtApp) => {
  const auth = useAuthStore(nuxtApp.$pinia as Pinia)
  const router = nuxtApp.$router as Router
  const controller = createAuthFreshnessController({
    check: () => auth.checkAndHandleFreshSession(router, { redirectUnauthenticated: true }),
    isAuthenticated: () => auth.isAuthenticated,
    hasPendingEmail: () => false,
  })

  let stopWatch: (() => void) | null = null

  void (async () => {
    if (auth.initPromise) {
      await auth.initPromise
    }

    controller.start()
    stopWatch = watch(
      () => auth.isAuthenticated,
      () => controller.syncPolling(),
    )
  })()

  nuxtApp.hook('app:beforeUnmount', () => {
    stopWatch?.()
    controller.stop()
  })
})
