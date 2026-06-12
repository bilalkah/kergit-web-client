export type LegalMarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'ordered-list'; items: string[] }

const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/
const ORDERED_LIST_PATTERN = /^\d+\.\s+(.+)$/
const BOLD_LEGAL_LINE_PATTERN = /^\*\*[^*]+/
const HARD_BREAK_PATTERN = / {2,}$/

type ParagraphLine = {
  text: string
  hardBreak: boolean
  boldLegalLine: boolean
}

export function parseLegalMarkdown(source: string): LegalMarkdownBlock[] {
  const blocks: LegalMarkdownBlock[] = []
  const paragraphLines: ParagraphLine[] = []
  const orderedItems: string[] = []

  function flushParagraph() {
    if (paragraphLines.length === 0) return

    const useLineBreaks = paragraphLines.every(line => line.boldLegalLine)
    const text = paragraphLines.reduce((result, line, index) => {
      if (index === 0) return line.text

      const previous = paragraphLines[index - 1]!
      return `${result}${useLineBreaks || previous.hardBreak ? '\n' : ' '}${line.text}`
    }, '')

    blocks.push({ type: 'paragraph', text })
    paragraphLines.length = 0
  }

  function flushOrderedList() {
    if (orderedItems.length === 0) return
    blocks.push({ type: 'ordered-list', items: [...orderedItems] })
    orderedItems.length = 0
  }

  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    const heading = line.match(HEADING_PATTERN)
    if (heading) {
      flushParagraph()
      flushOrderedList()
      blocks.push({
        type: 'heading',
        level: heading[1]!.length,
        text: heading[2]!,
      })
      continue
    }

    const orderedItem = line.match(ORDERED_LIST_PATTERN)
    if (orderedItem) {
      flushParagraph()
      orderedItems.push(orderedItem[1]!)
      continue
    }

    if (line.trim() === '') {
      flushParagraph()
      flushOrderedList()
      continue
    }

    flushOrderedList()
    const trimmedLine = line.trim()
    paragraphLines.push({
      text: trimmedLine,
      hardBreak: HARD_BREAK_PATTERN.test(line),
      boldLegalLine: BOLD_LEGAL_LINE_PATTERN.test(trimmedLine),
    })
  }

  flushParagraph()
  flushOrderedList()
  return blocks
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function renderLegalInlineMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replaceAll('\n', '<br>')
}
