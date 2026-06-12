export enum RichMessageNodeType {
  Text = 'text',
  Link = 'link',
  Image = 'image',
}

export type RichMessageTextNode = {
  type: RichMessageNodeType.Text
  text: string
}

export type RichMessageLinkNode = {
  type: RichMessageNodeType.Link
  url: string
  label: string
}

export type RichMessageImageNode = {
  type: RichMessageNodeType.Image
  url: string
  alt: string
}

export type RichMessageNode =
  | RichMessageTextNode
  | RichMessageLinkNode
  | RichMessageImageNode

const URL_CANDIDATE_REGEX = /\bhttps?:\/\/[^\s<>"'`]+/gi
const TRAILING_PUNCTUATION_REGEX = /[.,!?;:]+$/
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'])

function normalizeLinkCandidate(rawCandidate: string): { normalized: string; trailing: string } {
  let normalized = rawCandidate

  while (normalized.endsWith(')')) {
    const opens = normalized.split('(').length - 1
    const closes = normalized.split(')').length - 1
    if (closes <= opens) break
    normalized = normalized.slice(0, -1)
  }

  const punctuationMatch = normalized.match(TRAILING_PUNCTUATION_REGEX)
  if (!punctuationMatch) {
    return {
      normalized,
      trailing: rawCandidate.slice(normalized.length),
    }
  }

  normalized = normalized.slice(0, -punctuationMatch[0].length)
  return {
    normalized,
    trailing: rawCandidate.slice(normalized.length),
  }
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function isDirectImageUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    const pathname = parsed.pathname.toLowerCase()
    const dotIndex = pathname.lastIndexOf('.')
    if (dotIndex < 0 || dotIndex === pathname.length - 1) return false
    const extension = pathname.slice(dotIndex + 1)
    return IMAGE_EXTENSIONS.has(extension)
  } catch {
    return false
  }
}

function toNode(url: string): RichMessageNode {
  if (isDirectImageUrl(url)) {
    return {
      type: RichMessageNodeType.Image,
      url,
      alt: 'Mesaj görseli',
    }
  }

  return {
    type: RichMessageNodeType.Link,
    url,
    label: url,
  }
}

function pushText(nodes: RichMessageNode[], text: string) {
  if (!text) return
  const last = nodes[nodes.length - 1]
  if (last && last.type === RichMessageNodeType.Text) {
    last.text += text
    return
  }
  nodes.push({
    type: RichMessageNodeType.Text,
    text,
  })
}

export function parseMessageRichContent(content: string): RichMessageNode[] {
  const normalizedContent = content ?? ''
  if (!normalizedContent) {
    return [
      {
        type: RichMessageNodeType.Text,
        text: '',
      },
    ]
  }

  const nodes: RichMessageNode[] = []
  let cursor = 0
  let match: RegExpExecArray | null
  URL_CANDIDATE_REGEX.lastIndex = 0

  while ((match = URL_CANDIDATE_REGEX.exec(normalizedContent)) !== null) {
    const matchStart = match.index
    const rawCandidate = match[0]
    const matchEnd = matchStart + rawCandidate.length

    if (matchStart > cursor) {
      pushText(nodes, normalizedContent.slice(cursor, matchStart))
    }

    const { normalized, trailing } = normalizeLinkCandidate(rawCandidate)
    if (normalized && isValidHttpUrl(normalized)) {
      nodes.push(toNode(normalized))
      pushText(nodes, trailing)
    } else {
      pushText(nodes, rawCandidate)
    }

    cursor = matchEnd
  }

  if (cursor < normalizedContent.length) {
    pushText(nodes, normalizedContent.slice(cursor))
  }

  if (nodes.length === 0) {
    return [
      {
        type: RichMessageNodeType.Text,
        text: '',
      },
    ]
  }

  return nodes
}

export function extractFirstHttpUrl(content: string): string | null {
  const nodes = parseMessageRichContent(content)
  for (const node of nodes) {
    if (node.type === RichMessageNodeType.Link || node.type === RichMessageNodeType.Image) {
      return node.url
    }
  }
  return null
}
