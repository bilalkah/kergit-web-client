#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const PROJECT_ROOT = process.cwd()
const EXCLUDED_DIR_NAMES = new Set([
  '.git',
  'node_modules',
  '.nuxt',
  '.output',
  'dist',
  'src/generated',
])
const SCAN_ROOTS = [
  'components',
  'composables',
  'layouts',
  'middleware',
  'pages',
  'plugins',
  'server',
  'src',
  'stores',
]
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue'])
const FUNCTION_NAME_PATTERN = /\bfunction\s*\*?\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g

/** @typedef {{ filePath: string; line: number; name: string; normalizedBody: string }} FunctionEntry */

function shouldSkipDirectory(relativePath) {
  if (!relativePath) return false
  return EXCLUDED_DIR_NAMES.has(relativePath)
}

async function collectFilesFromRoot(relativeRoot) {
  const absoluteRoot = path.join(PROJECT_ROOT, relativeRoot)
  const collected = []

  async function walk(currentAbsolute, currentRelative) {
    const entries = await fs.readdir(currentAbsolute, { withFileTypes: true })
    for (const entry of entries) {
      const nextRelative = currentRelative
        ? path.posix.join(currentRelative, entry.name)
        : entry.name
      const nextAbsolute = path.join(currentAbsolute, entry.name)

      if (entry.isDirectory()) {
        if (shouldSkipDirectory(nextRelative)) continue
        await walk(nextAbsolute, nextRelative)
        continue
      }

      if (!entry.isFile()) continue
      if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue
      collected.push(nextAbsolute)
    }
  }

  try {
    await walk(absoluteRoot, relativeRoot)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return []
    }
    throw error
  }

  return collected
}

function extractSourceUnits(filePath, content) {
  const extension = path.extname(filePath)
  if (extension !== '.vue') {
    return [{ offset: 0, lineOffset: 0, content }]
  }

  const scriptUnits = []
  const scriptPattern = /<script\b[^>]*>([\s\S]*?)<\/script>/gi
  let match
  while ((match = scriptPattern.exec(content)) !== null) {
    const fullMatch = match[0] ?? ''
    const blockBody = match[1] ?? ''
    const fullMatchStart = match.index
    const bodyStartOffset = fullMatchStart + fullMatch.indexOf(blockBody)
    scriptUnits.push({
      offset: bodyStartOffset,
      lineOffset: lineFromOffset(content, bodyStartOffset) - 1,
      content: blockBody,
    })
  }
  return scriptUnits
}

function skipWhitespaceAndComments(source, index) {
  let cursor = index
  while (cursor < source.length) {
    const ch = source[cursor]
    const next = source[cursor + 1]
    if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') {
      cursor += 1
      continue
    }
    if (ch === '/' && next === '/') {
      cursor += 2
      while (cursor < source.length && source[cursor] !== '\n') cursor += 1
      continue
    }
    if (ch === '/' && next === '*') {
      cursor += 2
      while (cursor < source.length) {
        if (source[cursor] === '*' && source[cursor + 1] === '/') {
          cursor += 2
          break
        }
        cursor += 1
      }
      continue
    }
    break
  }
  return cursor
}

function findMatchingDelimiter(source, startIndex, openChar, closeChar) {
  let depth = 1
  let cursor = startIndex + 1
  let inSingle = false
  let inDouble = false
  let inTemplate = false
  let inLineComment = false
  let inBlockComment = false

  while (cursor < source.length) {
    const ch = source[cursor]
    const next = source[cursor + 1]
    const prev = source[cursor - 1]

    if (inLineComment) {
      if (ch === '\n') inLineComment = false
      cursor += 1
      continue
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false
        cursor += 2
        continue
      }
      cursor += 1
      continue
    }
    if (inSingle) {
      if (ch === '\'' && prev !== '\\') inSingle = false
      cursor += 1
      continue
    }
    if (inDouble) {
      if (ch === '"' && prev !== '\\') inDouble = false
      cursor += 1
      continue
    }
    if (inTemplate) {
      if (ch === '`' && prev !== '\\') {
        inTemplate = false
      }
      cursor += 1
      continue
    }

    if (ch === '/' && next === '/') {
      inLineComment = true
      cursor += 2
      continue
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true
      cursor += 2
      continue
    }
    if (ch === '\'') {
      inSingle = true
      cursor += 1
      continue
    }
    if (ch === '"') {
      inDouble = true
      cursor += 1
      continue
    }
    if (ch === '`') {
      inTemplate = true
      cursor += 1
      continue
    }

    if (ch === openChar) depth += 1
    if (ch === closeChar) depth -= 1
    if (depth === 0) return cursor
    cursor += 1
  }
  return -1
}

function findFunctionBodyStart(source, closingParenIndex) {
  let cursor = skipWhitespaceAndComments(source, closingParenIndex + 1)
  if (cursor >= source.length) return -1

  if (source[cursor] === ':') {
    cursor += 1
    while (cursor < source.length) {
      cursor = skipWhitespaceAndComments(source, cursor)
      const braceIndex = source.indexOf('{', cursor)
      if (braceIndex === -1) return -1
      const matchingBraceIndex = findMatchingDelimiter(source, braceIndex, '{', '}')
      if (matchingBraceIndex === -1) return -1
      const nextIndex = skipWhitespaceAndComments(source, matchingBraceIndex + 1)
      if (nextIndex < source.length && source[nextIndex] === '{') {
        cursor = nextIndex
        continue
      }
      return braceIndex
    }
    return -1
  }

  return source[cursor] === '{' ? cursor : source.indexOf('{', cursor)
}

function normalizeBody(body) {
  return body
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
}

function lineFromOffset(source, offset) {
  let line = 1
  for (let i = 0; i < offset && i < source.length; i += 1) {
    if (source[i] === '\n') line += 1
  }
  return line
}

function extractFunctionEntries(filePath, source, sourceOffset = 0, sourceLineOffset = 0) {
  const entries = []
  FUNCTION_NAME_PATTERN.lastIndex = 0

  let match
  while ((match = FUNCTION_NAME_PATTERN.exec(source)) !== null) {
    const functionName = match[1]
    const declarationStart = match.index
    const openParenIndex = source.indexOf('(', declarationStart)
    if (openParenIndex === -1) continue

    const closingParenIndex = findMatchingDelimiter(source, openParenIndex, '(', ')')
    if (closingParenIndex === -1) continue

    const bodyStartIndex = findFunctionBodyStart(source, closingParenIndex)
    if (bodyStartIndex === -1 || source[bodyStartIndex] !== '{') continue

    const bodyEndIndex = findMatchingDelimiter(source, bodyStartIndex, '{', '}')
    if (bodyEndIndex === -1) continue

    const body = source.slice(bodyStartIndex, bodyEndIndex + 1)
    const normalizedBody = normalizeBody(body)
    if (!normalizedBody) continue

    const absoluteOffset = sourceOffset + declarationStart
    entries.push({
      filePath,
      line: sourceLineOffset + lineFromOffset(source, declarationStart),
      name: functionName,
      normalizedBody,
      absoluteOffset,
    })

    FUNCTION_NAME_PATTERN.lastIndex = bodyEndIndex + 1
  }

  return entries
}

function hashBody(body) {
  return createHash('sha1').update(body).digest('hex')
}

function toProjectRelative(filePath) {
  return path.relative(PROJECT_ROOT, filePath).split(path.sep).join('/')
}

function printReport(duplicateGroups) {
  console.log(`Duplicate function groups: ${duplicateGroups.length}`)
  if (duplicateGroups.length === 0) {
    console.log('No cross-file duplicate function bodies found.')
    return
  }

  duplicateGroups.forEach((group, index) => {
    console.log('')
    console.log(
      `${index + 1}. hash=${group.hash.slice(0, 10)} files=${group.fileCount} functions=${group.entries.length}`,
    )
    for (const entry of group.entries) {
      console.log(
        `   - ${toProjectRelative(entry.filePath)}:${entry.line} (${entry.name})`,
      )
    }
  })
}

async function main() {
  const candidateFiles = (
    await Promise.all(SCAN_ROOTS.map(root => collectFilesFromRoot(root)))
  ).flat()

  /** @type {Map<string, FunctionEntry[]>} */
  const groupsByHash = new Map()

  for (const filePath of candidateFiles) {
    const content = await fs.readFile(filePath, 'utf8')
    const units = extractSourceUnits(filePath, content)
    const entries = units.flatMap(unit =>
      extractFunctionEntries(filePath, unit.content, unit.offset, unit.lineOffset),
    )

    for (const entry of entries) {
      const hash = hashBody(entry.normalizedBody)
      const list = groupsByHash.get(hash) ?? []
      list.push(entry)
      groupsByHash.set(hash, list)
    }
  }

  const duplicateGroups = Array.from(groupsByHash.entries())
    .map(([hash, entries]) => ({
      hash,
      entries: entries.sort((left, right) =>
        left.filePath === right.filePath
          ? left.absoluteOffset - right.absoluteOffset
          : left.filePath.localeCompare(right.filePath),
      ),
      fileCount: new Set(entries.map(entry => entry.filePath)).size,
    }))
    .filter(group => group.fileCount > 1)
    .sort((left, right) => right.entries.length - left.entries.length)

  printReport(duplicateGroups)
}

main().catch((error) => {
  console.error('dup-audit failed:', error)
  process.exit(1)
})
