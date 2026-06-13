import { AuthBootPhase, useAuthStore } from '~/stores/auth'
import { bootstrapServerSession } from '@/src/services/auth/http'
import { devError, devLog } from '@/src/utils/safeLogger'
import type { Pinia } from 'pinia'
import type { Router } from 'vue-router'

export default defineNuxtPlugin((nuxtApp) => {
  const auth = useAuthStore(nuxtApp.$pinia as Pinia)
  const router = nuxtApp.$router as Router
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
      const result = await bootstrapServerSession()

      if (result.status === 'stale_session') {
        auth.clearAuth()
        await router.replace('/login?email_change=success')
        auth.setReady(true)
        setBootPhase(AuthBootPhase.Done)
        return
      }

      if (result.status === 'unauthenticated') {
        auth.clearAuth()
        auth.setReady(true)
        setBootPhase(AuthBootPhase.Done)
        return
      }

      setBootPhase(AuthBootPhase.Resuming)
      auth.setSession(result.session)
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
