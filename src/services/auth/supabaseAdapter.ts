import type { Session as SupabaseSession } from '@supabase/supabase-js'
import type { AuthSession } from '@/stores/auth'

export function mapSupabaseSession(
    session: SupabaseSession | null
): AuthSession | null {
    if (!session || !session.access_token || !session.user) {
        return null
    }

    return {
        access_token: session.access_token,
        expires_at: session.expires_at ?? 0,
        user: {
            id: session.user.id,
            email: session.user.email ?? undefined,
            user_metadata: session.user.user_metadata ?? undefined
        }
    }
}
