import type { Session as SupabaseSession, User as SupabaseUser } from '@supabase/supabase-js'
import type { AuthSession, AuthUser } from '@/stores/auth'

export function mapSupabaseUser(user: SupabaseUser): AuthUser {
    return {
        id: user.id,
        email: user.email ?? undefined,
        new_email: user.new_email ?? undefined,
        email_change_sent_at: user.email_change_sent_at ?? undefined,
        user_metadata: user.user_metadata ?? undefined
    }
}

export function mapSupabaseSession(
    session: SupabaseSession | null
): AuthSession | null {
    if (!session || !session.access_token || !session.user) {
        return null
    }

    return {
        access_token: session.access_token,
        expires_at: session.expires_at ?? 0,
        user: mapSupabaseUser(session.user)
    }
}
