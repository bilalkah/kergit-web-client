import type { Session as SupabaseSession, User as SupabaseUser } from '@supabase/supabase-js'
import type { AuthSession, AuthUser } from '@/stores/auth'

export function mapSupabaseUser(user: SupabaseUser): AuthUser {
    // Only auth identity fields cross to the client. Supabase user_metadata is
    // never exposed: profile data (username/display_name/avatar_seed) is owned
    // by the Kergit backend profile flow (kergit_app.profiles via the app store),
    // and metadata can also carry legal-proof hashes / internal fields.
    return {
        id: user.id,
        email: user.email ?? undefined,
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
