import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import ChatMessageAttachmentList from './ChatMessageAttachmentList.vue'
import { ChatAttachmentKind, type ChatMessageAttachmentSignedUrlResolver } from '@/src/features/messages/types'

const flushAsync = async () => {
  await nextTick()
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
}

const imageAttachment = {
  id: 'attachment-1',
  kind: ChatAttachmentKind.Image,
  storageBucket: 'chat-attachments',
  storageKey: 'hub-1/channel-1/user-1/draft/asset.png',
  mimeType: 'image/png',
  displayName: 'asset.png',
  sizeBytes: 128,
  signedUrl: 'https://signed.example/asset.png',
}

describe('ChatMessageAttachmentList', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('reuses the cached object URL when the attachment list remounts', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(['image-bytes'], { type: 'image/png' }),
      text: async () => '',
    }))
    const createObjectURL = vi.fn(() => 'blob:asset-preview')
    const revokeObjectURL = vi.fn()

    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('URL', class URLMock {
      static createObjectURL = createObjectURL
      static revokeObjectURL = revokeObjectURL
    })

    const pinia = createPinia()
    setActivePinia(pinia)
    const resolveSignedUrl: ChatMessageAttachmentSignedUrlResolver = async (attachment) =>
      attachment.signedUrl ?? ''

    const mountList = () => mount(ChatMessageAttachmentList, {
      props: {
        channelId: 'channel-1',
        attachments: [imageAttachment],
        resolveSignedUrl,
      },
      global: {
        plugins: [pinia],
        stubs: {
          Teleport: true,
        },
      },
    })

    const firstWrapper = mountList()
    await flushAsync()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(firstWrapper.find('.chat-attachment-item__image').attributes('src')).toBe('blob:asset-preview')

    firstWrapper.unmount()

    const secondWrapper = mountList()
    await flushAsync()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(secondWrapper.find('.chat-attachment-item__image').attributes('src')).toBe('blob:asset-preview')
  })

  it('refreshes the signed URL once after an auth-expiry image fetch failure', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('expired')) {
        return {
          ok: false,
          status: 403,
          text: async (): Promise<string> => 'token expired',
        }
      }

      return {
        ok: true,
        status: 200,
        blob: async () => new Blob(['refreshed-image'], { type: 'image/png' }),
        text: async (): Promise<string> => '',
      }
    })
    const createObjectURL = vi.fn(() => 'blob:refreshed-preview')
    const revokeObjectURL = vi.fn()

    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('URL', class URLMock {
      static createObjectURL = createObjectURL
      static revokeObjectURL = revokeObjectURL
    })

    const pinia = createPinia()
    setActivePinia(pinia)
    const resolveSignedUrl = vi.fn(async (_attachment, options) => {
      if (options?.forceRefresh) return 'https://signed.example/refreshed.png'
      return ''
    })

    const wrapper = mount(ChatMessageAttachmentList, {
      props: {
        channelId: 'channel-1',
        attachments: [
          {
            ...imageAttachment,
            signedUrl: 'https://signed.example/expired.png',
          },
        ],
        resolveSignedUrl: resolveSignedUrl as ChatMessageAttachmentSignedUrlResolver,
      },
      global: {
        plugins: [pinia],
        stubs: {
          Teleport: true,
        },
      },
    })

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    expect(resolveSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'attachment-1' }),
      { forceRefresh: true },
    )
    expect(wrapper.find('.chat-attachment-item__image').attributes('src')).toBe('blob:refreshed-preview')
  })
})
