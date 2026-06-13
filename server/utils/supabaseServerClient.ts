import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { WebSocketLikeConstructor } from '@supabase/realtime-js'
import WebSocket from 'ws'

const serverWebSocketTransport = WebSocket as unknown as WebSocketLikeConstructor

const serverSupabaseOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    flowType: 'implicit' as const,
  },
  realtime: {
    // Supabase constructs RealtimeClient eagerly; Node 20 needs an explicit transport.
    transport: serverWebSocketTransport,
  },
}

export function createServerSupabaseClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, serverSupabaseOptions)
}
