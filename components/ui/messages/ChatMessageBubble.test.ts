import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import ChatMessageBubble from './ChatMessageBubble.vue'
import type {
  ChatMessageAttachment,
  ChatMessageAttachmentSignedUrlResolver,
} from '@/src/features/messages/types'

const resolveAttachmentSignedUrlStub: ChatMessageAttachmentSignedUrlResolver = async (
  attachment: ChatMessageAttachment,
) => attachment.signedUrl ?? ''

describe('ChatMessageBubble', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('does not render timestamp inside the bubble', () => {
    const wrapper = mount(ChatMessageBubble, {
      props: {
        channelId: 'channel-1',
        message: {
          id: 'msg-1',
          content: 'Merhaba',
          own: false,
          createdAtMs: Date.UTC(2026, 2, 30, 11, 5, 0),
        },
        resolveAttachmentSignedUrl: resolveAttachmentSignedUrlStub,
      },
    })

    const timeEl = wrapper.find('.chat-message-bubble__time')
    expect(timeEl.exists()).toBe(false)
  })

  it('renders clickable links with safe attributes', () => {
    const wrapper = mount(ChatMessageBubble, {
      props: {
        channelId: 'channel-1',
        message: {
          id: 'msg-2',
          content: 'https://example.com',
          own: false,
          createdAtMs: 0,
        },
        resolveAttachmentSignedUrl: resolveAttachmentSignedUrlStub,
      },
    })

    const link = wrapper.find('.chat-message-content__link')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('https://example.com')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toContain('noopener')
    expect(link.attributes('rel')).toContain('noreferrer')
  })

  it('renders direct image URLs as safe links instead of inline previews', () => {
    const wrapper = mount(ChatMessageBubble, {
      props: {
        channelId: 'channel-1',
        message: {
          id: 'msg-3',
          content: 'https://cdn.example.com/pic.webp',
          own: true,
          createdAtMs: 0,
        },
        resolveAttachmentSignedUrl: resolveAttachmentSignedUrlStub,
      },
    })

    const image = wrapper.find('.chat-message-content__image')
    expect(image.exists()).toBe(false)

    const links = wrapper.findAll('.chat-message-content__link')
    expect(links.length).toBeGreaterThan(0)
    expect(links[0]?.attributes('href')).toBe('https://cdn.example.com/pic.webp')
  })

  it('renders link preview metadata without loading an external thumbnail', () => {
    const wrapper = mount(ChatMessageBubble, {
      props: {
        channelId: 'channel-1',
        message: {
          id: 'msg-4',
          content: 'paylasim',
          own: false,
          createdAtMs: 0,
          linkPreview: {
            url: 'https://example.com/post',
            title: 'Example Title',
            description: 'Example Description',
            siteName: 'Example',
            imageUrl: 'https://cdn.example.com/thumb.webp',
          },
        },
        resolveAttachmentSignedUrl: resolveAttachmentSignedUrlStub,
      },
    })

    expect(wrapper.find('.chat-link-preview__image').exists()).toBe(false)
    expect(wrapper.text()).toContain('Example Title')
    expect(wrapper.text()).toContain('Example Description')
  })
})
