import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from './app'

describe('app attachment cache', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('reuses signed attachment URLs across channel switches while cached URLs stay valid', async () => {
    const fetchMock = vi.fn(async () => ({
      expiresInSec: 900,
      urls: [
        {
          path: 'hub-1/channel-1/user-1/draft/asset.png',
          signedUrl: 'https://signed.example/asset.png',
        },
      ],
    }))

    vi.stubGlobal('$fetch', fetchMock)

    const app = useAppStore()
    app.setActiveChannel('hub-1', 'channel-1')

    await app.ensureSignedAttachmentUrls('channel-1', ['hub-1/channel-1/user-1/draft/asset.png'])
    expect(fetchMock).toHaveBeenCalledTimes(1)

    app.setActiveChannel('hub-1', 'channel-2')
    app.setActiveChannel('hub-1', 'channel-1')

    await app.ensureSignedAttachmentUrls('channel-1', ['hub-1/channel-1/user-1/draft/asset.png'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(app.getCachedSignedAttachmentUrl('channel-1', 'hub-1/channel-1/user-1/draft/asset.png')).toBe(
      'https://signed.example/asset.png',
    )
  })

  it('evicts the oldest preview object URL when the preview cache exceeds the entry limit', () => {
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', {
      revokeObjectURL,
    })

    const app = useAppStore()

    for (let index = 0; index < 101; index += 1) {
      app.cacheAttachmentPreviewObjectUrl(
        'channel-1',
        `hub-1/channel-1/user-1/draft/asset-${index}.png`,
        `blob:asset-${index}`,
        1024,
      )
    }

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:asset-0')
    expect(app.hasCachedAttachmentPreviewObjectUrl('channel-1', 'hub-1/channel-1/user-1/draft/asset-0.png')).toBe(false)
    expect(app.hasCachedAttachmentPreviewObjectUrl('channel-1', 'hub-1/channel-1/user-1/draft/asset-100.png')).toBe(true)
  })

  it('revokes cached preview object URLs when app state is cleared', () => {
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', {
      revokeObjectURL,
    })

    const app = useAppStore()
    app.cacheAttachmentPreviewObjectUrl(
      'channel-1',
      'hub-1/channel-1/user-1/draft/asset.png',
      'blob:asset',
      4096,
    )

    app.clearAll()

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:asset')
    expect(app.hasCachedAttachmentPreviewObjectUrl('channel-1', 'hub-1/channel-1/user-1/draft/asset.png')).toBe(false)
    expect(app.getCachedSignedAttachmentUrl('channel-1', 'hub-1/channel-1/user-1/draft/asset.png')).toBe('')
  })
})
