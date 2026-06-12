import type { FreshSessionResult } from '@/src/services/auth/freshSession'
import type { AuthSession } from '@/stores/auth'

type FreshSessionDependencies = {
  refreshToken?: string
  clearCookies: () => void
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

  const restoredSession = await dependencies.restoreSession()
  if (!restoredSession) {
    throw new FreshSessionAuthenticationRequiredError()
  }

  return {
    status: 'ok',
    session: restoredSession,
  }
}
