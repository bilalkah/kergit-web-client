import type { Session as SupabaseSession } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { mapSupabaseSession, mapSupabaseUser } from './supabaseAdapter'

describe('mapSupabaseSession', () => {
  it('maps the session user fields', () => {
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
      },
    }

    expect(mapSupabaseSession(session)).toEqual({
      access_token: 'access-token',
      expires_at: 1234567890,
      user: {
        id: 'user-id',
        email: 'current@example.com',
        user_metadata: {},
      },
    })
  })
})

describe('mapSupabaseUser', () => {
  it('maps the user fields without requiring a session', () => {
    const user: SupabaseSession['user'] = {
      id: 'user-id',
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-06-13T00:00:00.000Z',
      email: 'current@example.com',
    }

    expect(mapSupabaseUser(user)).toEqual({
      id: 'user-id',
      email: 'current@example.com',
      user_metadata: {},
    })
  })
})
