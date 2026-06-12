import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Singleton instance for client-side
let clientInstance: SupabaseClient | null = null

export function useSupabase() {
  if (import.meta.server) {
    throw new Error('useSupabase is browser-only. Use createServerSupabaseClient for server/API code.')
  }

  const config = useRuntimeConfig()

  // Return existing browser instance if available.
  if (clientInstance) {
    return clientInstance
  }

  // The browser Supabase client is only used for unauthenticated flows such as
  // signup and reset-email initiation. Persistent auth is restored via
  // server-managed HttpOnly cookies instead of browser storage.
  const client = createClient(
    config.public.supabaseUrl,
    config.public.supabaseAnonKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      }
    }
  )

  clientInstance = client

  return client
}
