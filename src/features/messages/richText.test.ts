import { describe, expect, it } from 'vitest'
import { parseMessageRichContent, RichMessageNodeType } from './richText'

describe('parseMessageRichContent', () => {
  it('returns plain text as a single text node', () => {
    const result = parseMessageRichContent('Merhaba dunya')
    expect(result).toEqual([
      {
        type: RichMessageNodeType.Text,
        text: 'Merhaba dunya',
      },
    ])
  })

  it('tokenizes mixed text and URL nodes', () => {
    const result = parseMessageRichContent('Bak: https://example.com/test ve devam')
    expect(result).toEqual([
      {
        type: RichMessageNodeType.Text,
        text: 'Bak: ',
      },
      {
        type: RichMessageNodeType.Link,
        url: 'https://example.com/test',
        label: 'https://example.com/test',
      },
      {
        type: RichMessageNodeType.Text,
        text: ' ve devam',
      },
    ])
  })

  it('keeps trailing punctuation outside links', () => {
    const result = parseMessageRichContent('Oku https://example.com/path.')
    expect(result).toEqual([
      {
        type: RichMessageNodeType.Text,
        text: 'Oku ',
      },
      {
        type: RichMessageNodeType.Link,
        url: 'https://example.com/path',
        label: 'https://example.com/path',
      },
      {
        type: RichMessageNodeType.Text,
        text: '.',
      },
    ])
  })

  it('emits image node for direct image URLs', () => {
    const result = parseMessageRichContent('https://cdn.example.com/image.png?size=large')
    expect(result).toEqual([
      {
        type: RichMessageNodeType.Image,
        url: 'https://cdn.example.com/image.png?size=large',
        alt: 'Mesaj görseli',
      },
    ])
  })

  it('emits link node for non-image URLs', () => {
    const result = parseMessageRichContent('https://example.com/page')
    expect(result).toEqual([
      {
        type: RichMessageNodeType.Link,
        url: 'https://example.com/page',
        label: 'https://example.com/page',
      },
    ])
  })
})
