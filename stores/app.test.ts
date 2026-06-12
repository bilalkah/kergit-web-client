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

  it('shows display_name (not username) as the visible member name', () => {
    const app = useAppStore()

    app.hydrateFromStateSync({
      self: { id: 'self-1', metadata: { username: 'self', display_name: 'Self', avatar_seed: 'Caleb' } },
      hubs: [{
        hub: { id: 'hub-1', name: 'Hub', metadata: { avatar_seed: 'Caleb' } },
        members: [{ member: { user_id: 'user-1', role: 0, is_online: true } }],
        users: [{
          user: {
            id: 'user-1',
            metadata: { username: 'aliveli', display_name: 'bilal', avatar_seed: 'Caleb' },
          },
        }],
        channels: [],
      }],
    } as never)

    expect(app.getUserInfo('hub-1', 'user-1')?.username).toBe('aliveli')
    expect(app.getUserInfo('hub-1', 'user-1')?.display_name).toBe('bilal')
    // Visible name must be display_name, not the @handle.
    expect(app.getUserDisplayName('hub-1', 'user-1')).toBe('bilal')
  })

  it('surfaces a duplicate-username error as the user-facing Turkish message', () => {
    const app = useAppStore()
    const USER_UPDATE = 53

    // Server reports the unique-username (23505) violation as a clean Turkish message.
    app.setCommandError(
      USER_UPDATE,
      11,
      'Bu kullanıcı adı kullanımda. Lütfen başka bir kullanıcı adı seçin.',
    )

    expect(app.commandErrors[USER_UPDATE]?.message).toBe(
      'Bu kullanıcı adı kullanımda. Lütfen başka bir kullanıcı adı seçin.',
    )
    expect(app.commandErrors[USER_UPDATE]?.message).not.toMatch(/duplicate key|23505|unique constraint/i)
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

  it('keeps and maps an attachment-only message (empty content) from a state delta', () => {
    const app = useAppStore()

    app.applyStateDelta({
      hubs: [{
        hub_id: 'hub-1',
        channels: [{
          channel_id: 'channel-1',
          message_ops: [{
            append: {
              state: {
                message: {
                  id: 'msg-att-1',
                  author_id: 'user-1',
                  content: '',
                  attachments: [{
                    id: 'att-1',
                    kind: 1,
                    storage_bucket: 'chat-attachments',
                    storage_key: 'hub-1/channel-1/user-1/draft/asset.png',
                    mime_type: 'image/png',
                    display_name: 'asset.png',
                    size_bytes: 128,
                  }],
                  created_at_unix_us: 1000,
                },
              },
            },
          }],
        }],
      }],
    } as never)

    const messages = app.messagesByChannel['channel-1'] ?? []
    expect(messages.length).toBe(1)
    // Attachment-only message must be kept even though content is empty.
    expect(messages[0].content).toBe('')
    expect(messages[0].attachments.length).toBe(1)
    expect(messages[0].attachments[0].storageBucket).toBe('chat-attachments')
    expect(messages[0].attachments[0].storageKey).toBe('hub-1/channel-1/user-1/draft/asset.png')
    expect(messages[0].attachments[0].mimeType).toBe('image/png')
    expect(messages[0].attachments[0].displayName).toBe('asset.png')
    expect(messages[0].attachments[0].sizeBytes).toBe(128)
  })

  it('updates an existing channel on rename and removes it with correct count', () => {
    const app = useAppStore()

    app.hydrateFromStateSync({
      self: { id: 'self-1', metadata: { username: 'me', display_name: 'Me', avatar_seed: 'Caleb' } },
      hubs: [{
        hub: { id: 'hub-1', name: 'Hub', metadata: { avatar_seed: 'Caleb' } },
        members: [{ member: { user_id: 'self-1', role: 3, is_online: true } }],
        users: [],
        channels: [
          { channel: { id: 'channel-1', type: 1, metadata: { name: 'general' } } },
          { channel: { id: 'channel-2', type: 1, metadata: { name: 'random' } } },
        ],
      }],
    } as never)

    expect((app.channelsByHub['hub-1'] ?? []).length).toBe(2)
    expect(app.hubs.find(h => h.id === 'hub-1')?.channels_count).toBe(2)

    // Rename channel-1: upsert must update the existing channel, not duplicate it.
    app.applyStateDelta({
      hubs: [{
        hub_id: 'hub-1',
        channels: [{
          channel_id: 'channel-1',
          channel_ops: [{ upsert: { channel: { id: 'channel-1', type: 1, metadata: { name: 'general-renamed' } } } }],
        }],
      }],
    } as never)

    const channelsAfterRename = app.channelsByHub['hub-1'] ?? []
    expect(channelsAfterRename.length).toBe(2)
    expect(channelsAfterRename.find(c => c.id === 'channel-1')?.name).toBe('general-renamed')

    // Remove channel-2: must drop it and keep channels_count in sync.
    app.applyStateDelta({
      hubs: [{
        hub_id: 'hub-1',
        channels: [{
          channel_id: 'channel-2',
          channel_ops: [{ remove: {} }],
        }],
      }],
    } as never)

    const channelsAfterRemove = app.channelsByHub['hub-1'] ?? []
    expect(channelsAfterRemove.length).toBe(1)
    expect(channelsAfterRemove.some(c => c.id === 'channel-2')).toBe(false)
    expect(app.hubs.find(h => h.id === 'hub-1')?.channels_count).toBe(1)
  })

  it('orders messages by message_seq and builds seq-based cursors', () => {
    const app = useAppStore()

    // Deliver out of seq order; created_at is intentionally inverted so that
    // ordering by created_at would produce a different result than by seq.
    app.applyStateDelta({
      hubs: [{
        hub_id: 'hub-1',
        channels: [{
          channel_id: 'channel-1',
          message_ops: [{
            batch: {
              direction: 1,
              states: [
                { message: { id: 'm2', author_id: 'u1', content: 'b', message_seq: 2, created_at_unix_us: 100 } },
                { message: { id: 'm1', author_id: 'u1', content: 'a', message_seq: 1, created_at_unix_us: 999 } },
                { message: { id: 'm3', author_id: 'u1', content: 'c', message_seq: 3, created_at_unix_us: 50 } },
              ],
            },
          }],
        }],
      }],
    } as never)

    const msgs = app.messagesByChannel['channel-1'] ?? []
    expect(msgs.map(m => m.id)).toEqual(['m1', 'm2', 'm3'])
    expect(msgs.map(m => m.messageSeq)).toEqual([1, 2, 3])
    // Cursors are sequence-based, not timestamp/id based.
    expect(app.getOldestMessageCursor('channel-1')).toEqual({ message_seq: 1 })
    expect(app.getLatestMessageCursor('channel-1')).toEqual({ message_seq: 3 })
  })

  it('keeps a not-yet-persisted (messageSeq 0) message ordered last via created_at fallback', () => {
    const app = useAppStore()

    app.applyStateDelta({
      hubs: [{
        hub_id: 'hub-1',
        channels: [{
          channel_id: 'channel-1',
          message_ops: [
            { batch: { direction: 1, states: [
              { message: { id: 'm1', author_id: 'u1', content: 'a', message_seq: 1, created_at_unix_us: 100 } },
              { message: { id: 'm2', author_id: 'u1', content: 'b', message_seq: 2, created_at_unix_us: 200 } },
            ] } },
            // Optimistic live append before DB persistence: no message_seq yet.
            { append: { state: { message: { id: 'm-live', author_id: 'u1', content: 'live', created_at_unix_us: 300 } } } },
          ],
        }],
      }],
    } as never)

    const msgs = app.messagesByChannel['channel-1'] ?? []
    expect(msgs.map(m => m.id)).toEqual(['m1', 'm2', 'm-live'])
    expect(msgs.find(m => m.id === 'm-live')?.messageSeq).toBe(0)
    // The pending message must not become a pagination cursor.
    expect(app.getLatestMessageCursor('channel-1')).toEqual({ message_seq: 2 })
  })
})
