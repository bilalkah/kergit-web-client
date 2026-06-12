import type { AuthSession } from '@/stores/auth'

export type FreshSessionResult = {
  status: 'ok'
  session: AuthSession
}

export type AuthBootstrapResult =
  | FreshSessionResult
  | {
      status: 'unauthenticated'
      session: null
    }
