import { hasAuthoritativeEmailChanged, type FreshSessionResult } from '@/src/services/auth/freshSession'
import type { AuthSession } from '@/stores/auth'

type FreshSessionDependencies = {
  accessToken?: string
  refreshToken?: string
  clearCookies: () => void
  getLocalEmail: (accessToken: string) => Promise<string | undefined>
  getFreshEmail: (accessToken: string) => Promise<string | undefined>
  restoreSession: () => Promise<AuthSession | null>
}

export class FreshSessionAuthenticationRequiredError extends Error {
  constructor() {
    super('Authentication required')
    this.name = 'FreshSessionAuthenticationRequiredError'
  }
}

export async function resolveFreshSession(
  dependencies: FreshSessionDependencies
): Promise<FreshSessionResult> {
  if (!dependencies.refreshToken) {
    dependencies.clearCookies()
    throw new FreshSessionAuthenticationRequiredError()
  }

  if (dependencies.accessToken) {
    try {
      const localEmail = await dependencies.getLocalEmail(dependencies.accessToken)
      const freshEmail = await dependencies.getFreshEmail(dependencies.accessToken)

      if (hasAuthoritativeEmailChanged(localEmail, freshEmail)) {
        dependencies.clearCookies()
        return {
          status: 'stale_session',
          reason: 'email_changed',
          action: 'force_relogin',
        }
      }
    } catch {
      // The normal restore path below can refresh an expired access token.
    }
  }

  const restoredSession = await dependencies.restoreSession()
  if (!restoredSession) {
    throw new FreshSessionAuthenticationRequiredError()
  }

  return {
    status: 'ok',
    session: restoredSession,
  }
}
