import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('./supabaseServerClient', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}))

describe('getSupabaseAdminClient', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.createServerSupabaseClient.mockReset()
    mocks.createServerSupabaseClient.mockReturnValue({} as never)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads the service-role key only from private runtime config', async () => {
    vi.stubGlobal('useRuntimeConfig', vi.fn(() => ({
      supabaseServiceRoleKey: 'private-service-role-key',
      public: {
        supabaseUrl: 'https://project.supabase.co',
        supabaseServiceRoleKey: 'public-wrong-key',
      },
    })))
    const { getSupabaseAdminClient } = await import('./supabaseAdmin')

    getSupabaseAdminClient()

    expect(mocks.createServerSupabaseClient).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'private-service-role-key',
    )
  })

  it('rejects a missing private service-role key', async () => {
    vi.stubGlobal('useRuntimeConfig', vi.fn(() => ({
      supabaseServiceRoleKey: '',
      public: {
        supabaseUrl: 'https://project.supabase.co',
        supabaseServiceRoleKey: 'public-wrong-key',
      },
    })))
    const { getSupabaseAdminClient } = await import('./supabaseAdmin')

    expect(() => getSupabaseAdminClient()).toThrow('Supabase admin runtime configuration is missing')
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled()
  })
})
