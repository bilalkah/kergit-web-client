import type { Session as SupabaseSession } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { mapSupabaseSession, mapSupabaseUser } from './supabaseAdapter'

describe('mapSupabaseSession', () => {
  it('maps only auth identity fields and never returns user_metadata', () => {
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
        user_metadata: { username: 'bob', display_name: 'Bob' },
        created_at: '2026-06-13T00:00:00.000Z',
        email: 'current@example.com',
      },
    }

    const mapped = mapSupabaseSession(session)

    expect(mapped).toEqual({
      access_token: 'access-token',
      expires_at: 1234567890,
      user: {
        id: 'user-id',
        email: 'current@example.com',
      },
    })
    expect(mapped?.user).not.toHaveProperty('user_metadata')
  })
})

describe('mapSupabaseUser', () => {
  it('returns only id and email, without user_metadata', () => {
    const user: SupabaseSession['user'] = {
      id: 'user-id',
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-06-13T00:00:00.000Z',
      email: 'current@example.com',
    }

    const mapped = mapSupabaseUser(user)

    expect(mapped).toEqual({
      id: 'user-id',
      email: 'current@example.com',
    })
    expect(mapped).not.toHaveProperty('user_metadata')
  })

  it('does not leak username/display_name/avatar_seed/legal hashes or unknown metadata to the client', () => {
    const user: SupabaseSession['user'] = {
      id: 'user-id',
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {
        username: 'bob',
        user_name: 'bob',
        display_name: 'Bob',
        avatar_seed: 'Caleb',
        legal_terms_hash: 'deadbeef'.repeat(8),
        legal_privacy_notice_hash: 'feedface'.repeat(8),
        some_future_internal_flag: true,
      },
      created_at: '2026-06-13T00:00:00.000Z',
      email: 'current@example.com',
    }

    const mapped = mapSupabaseUser(user)

    expect(mapped).not.toHaveProperty('user_metadata')
    // No metadata-derived value should appear anywhere in the returned object.
    const serialized = JSON.stringify(mapped)
    expect(serialized).not.toContain('bob')
    expect(serialized).not.toContain('Bob')
    expect(serialized).not.toContain('Caleb')
    expect(serialized).not.toContain('deadbeef')
    expect(serialized).not.toContain('feedface')
    expect(serialized).not.toContain('some_future_internal_flag')
  })
})
