import type { Session as SupabaseSession } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { mapSupabaseSession, mapSupabaseUser } from './supabaseAdapter'

describe('mapSupabaseSession', () => {
  it('maps type-safe pending email fields', () => {
    const session: SupabaseSession = {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      expires_at: 1234567890,
      token_type: 'bearer',
      user: {
        id: 'user-id',
        aud: 'authenticated',
        app_metadata: {},
        user_metadata: {},
        created_at: '2026-06-13T00:00:00.000Z',
        email: 'current@example.com',
        new_email: 'pending@example.com',
        email_change_sent_at: '2026-06-13T00:01:00.000Z',
      },
    }

    expect(mapSupabaseSession(session)).toEqual({
      access_token: 'access-token',
      expires_at: 1234567890,
      user: {
        id: 'user-id',
        email: 'current@example.com',
        new_email: 'pending@example.com',
        email_change_sent_at: '2026-06-13T00:01:00.000Z',
        user_metadata: {},
      },
    })
  })
})

describe('mapSupabaseUser', () => {
  it('maps pending email fields without requiring a session', () => {
    const user: SupabaseSession['user'] = {
      id: 'user-id',
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-06-13T00:00:00.000Z',
      email: 'current@example.com',
      new_email: 'pending@example.com',
      email_change_sent_at: '2026-06-13T00:01:00.000Z',
    }

    expect(mapSupabaseUser(user)).toEqual({
      id: 'user-id',
      email: 'current@example.com',
      new_email: 'pending@example.com',
      email_change_sent_at: '2026-06-13T00:01:00.000Z',
      user_metadata: {},
    })
  })
})
