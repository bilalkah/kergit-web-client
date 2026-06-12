import { AuthBootPhase, useAuthStore } from '~/stores/auth'
import { restoreServerSession } from '@/src/services/auth/http'
import { devError, devLog } from '@/src/utils/safeLogger'
import type { Pinia } from 'pinia'

export default defineNuxtPlugin((nuxtApp) => {
  const auth = useAuthStore(nuxtApp.$pinia as Pinia)
  let pendingBootPhase: AuthBootPhase | null = null
  let bootPhaseHooked = false

  const setBootPhase = (phase: AuthBootPhase) => {
    if (nuxtApp.isHydrating) {
      pendingBootPhase = phase
      if (!bootPhaseHooked) {
        bootPhaseHooked = true
        nuxtApp.hook('app:mounted', () => {
          if (pendingBootPhase) {
            auth.bootPhase = pendingBootPhase
            pendingBootPhase = null
          }
        })
      }
      return
    }

    auth.bootPhase = phase
  }

  setBootPhase(AuthBootPhase.Checking)
  auth.setReady(false)

  const initializeAuth = async () => {
    try {
      const restoredSession = await restoreServerSession()

      if (!restoredSession) {
        auth.clearAuth()
        auth.setReady(true)
        setBootPhase(AuthBootPhase.Done)
        return
      }

      setBootPhase(AuthBootPhase.Resuming)
      auth.setSession(restoredSession)
      auth.setReady(true)
      devLog('[auth-init] session restored')
      setBootPhase(AuthBootPhase.Done)
    } catch (error) {
      devError('[auth-init] unexpected error during boot', error)
      auth.clearAuth()
      auth.setReady(true)
      setBootPhase(AuthBootPhase.Done)
    } finally {
      auth.resolveInit()
    }
  }

  void initializeAuth()
})
