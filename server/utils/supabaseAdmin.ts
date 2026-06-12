import { type SupabaseClient } from '@supabase/supabase-js'
import { createError } from 'h3'
import { createServerSupabaseClient } from './supabaseServerClient'

let adminClient: SupabaseClient | null = null

export function getSupabaseAdminClient(): SupabaseClient {
  if (adminClient) return adminClient

  const config = useRuntimeConfig()
  const supabaseUrl = config.public.supabaseUrl
  const serviceRoleKey = config.supabaseServiceRoleKey

  if (!supabaseUrl || !serviceRoleKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Supabase admin runtime configuration is missing (NUXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)',
    })
  }

  adminClient = createServerSupabaseClient(supabaseUrl, serviceRoleKey)

  return adminClient
}
