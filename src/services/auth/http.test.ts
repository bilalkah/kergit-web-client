import { $fetch } from 'ofetch'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteCurrentAccount } from './http'

vi.mock('ofetch', () => ({
  $fetch: vi.fn(),
}))

describe('deleteCurrentAccount', () => {
  beforeEach(() => {
    vi.mocked($fetch).mockReset()
  })

  it('posts the email confirmation to the server endpoint', async () => {
    vi.mocked($fetch).mockResolvedValue({ ok: true })

    await deleteCurrentAccount({ emailConfirmation: 'user@example.com' })

    expect($fetch).toHaveBeenCalledWith('/api/auth/delete-account', {
      method: 'POST',
      body: {
        emailConfirmation: 'user@example.com',
      },
    })
  })

  it('maps server failures through the account-delete error context', async () => {
    vi.mocked($fetch).mockRejectedValue({
      statusCode: 401,
      statusMessage: 'Authentication required',
    })

    await expect(deleteCurrentAccount({
      emailConfirmation: 'user@example.com',
    })).rejects.toThrow('Oturumun süresi dolmuş. Lütfen tekrar giriş yap.')
  })
})
