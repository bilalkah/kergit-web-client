import { createError, defineEventHandler, readBody } from 'h3'
import { requireChatMembership } from '../../utils/chatAccess'
import { assertPublicHostname } from '../../utils/linkPreview'
import { logSafeServerDiagnostic, logSafeServerFailure } from '../../utils/safeServerDiagnostics'

type LinkPreviewRequest = {
  url?: string
  channelId?: string
}

type LinkPreviewResponse = {
  url: string
  title: string
  description: string
  siteName: string
  imageUrl: string
}

type CachedPreview = {
  expiresAtMs: number
  value: LinkPreviewResponse | null
}

enum UnfurlFailureReason {
  FetchFailed = 'fetch_failed',
  FetchNotOk = 'fetch_not_ok',
  UnsupportedContentType = 'unsupported_content_type',
  HeadReadFailed = 'head_read_failed',
  HeadTruncated = 'head_truncated',
  RedirectBlocked = 'redirect_blocked',
  RedirectLimitExceeded = 'redirect_limit_exceeded',
  MetadataMissing = 'metadata_missing',
  UnexpectedError = 'unexpected_error',
}

type UnfurlResult = {
  preview: LinkPreviewResponse | null
  reason: UnfurlFailureReason | null
}

const previewCache = new Map<string, CachedPreview>()
const MAX_HTML_BYTES = 256 * 1024
const MAX_OEMBED_BYTES = 128 * 1024
const NEGATIVE_CACHE_TTL_MS = 60_000
const DEFAULT_MAX_REDIRECTS = 3
const DEFAULT_CACHE_MAX_ENTRIES = 1000

type FetchWithRedirectValidationResult = {
  response: Response | null
  resolvedUrl: URL
  reason: UnfurlFailureReason | null
  redirectCount: number
}

type HeadReadResult = {
  content: string
  truncated: boolean
}

const META_TAG_REGEX = /<meta\s+[^>]*>/gi
const LINK_TAG_REGEX = /<link\s+[^>]*>/gi
const TITLE_REGEX = /<title[^>]*>(.*?)<\/title>/is
const ATTRIBUTE_REGEX = /([a-zA-Z_:.-]+)\s*=\s*["']([^"']*)["']/g
const HEAD_CLOSE_REGEX = /<\/head>/i

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

function normalizeText(input: string, maxLength = 512): string {
  const trimmed = decodeHtmlEntities((input ?? '').replace(/\s+/g, ' ').trim())
  if (trimmed.length <= maxLength) return trimmed
  return trimmed.slice(0, maxLength)
}

function logLinkPreview(event: string, details: Record<string, unknown>) {
  // Details can include user-supplied URLs (which may carry ?token=/?code=);
  // the helper redacts the whole context before emitting.
  logSafeServerDiagnostic('[chat/link-preview]', { route: 'chat/link-preview', stage: event, ...details })
}

function parseTagAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  let match: RegExpExecArray | null
  ATTRIBUTE_REGEX.lastIndex = 0

  while ((match = ATTRIBUTE_REGEX.exec(tag)) !== null) {
    const rawName = match[1] ?? ''
    if (!rawName) continue
    attrs[rawName.toLowerCase()] = match[2] ?? ''
  }

  return attrs
}

function getMetaContent(html: string, keys: string[]): string {
  const keySet = new Set(keys.map((key) => key.toLowerCase()))

  for (const tag of html.match(META_TAG_REGEX) ?? []) {
    const attrs = parseTagAttributes(tag)
    const prop = attrs.property?.toLowerCase() ?? attrs.name?.toLowerCase() ?? ''
    if (!prop || !keySet.has(prop)) continue
    if (attrs.content?.trim()) return attrs.content
  }

  return ''
}

function getTitleContent(html: string): string {
  const titleMatch = html.match(TITLE_REGEX)
  return titleMatch?.[1] ?? ''
}

function hasEnoughHeadMetadata(html: string): boolean {
  const hasTitle =
    getMetaContent(html, ['og:title', 'twitter:title']).trim().length > 0 ||
    normalizeText(getTitleContent(html), 180).length > 0
  const hasDescription = getMetaContent(html, ['og:description', 'description', 'twitter:description']).trim().length > 0
  const hasImage = getMetaContent(html, ['og:image', 'twitter:image']).trim().length > 0
  return hasTitle && (hasDescription || hasImage)
}

async function assertPublicHostnameOrThrow(hostname: string): Promise<void> {
  try {
    await assertPublicHostname(hostname)
  } catch (error) {
    logSafeServerFailure('chat/link-preview', { stage: 'assert_public_hostname' }, error)
    throw createError({
      statusCode: 400,
      statusMessage: 'Blocked URL target',
    })
  }
}

async function fetchWithTimeout(
  targetUrl: URL,
  timeoutMs: number,
  accept: string,
): Promise<Response> {
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort('timeout'), timeoutMs)

  try {
    return await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'user-agent': 'KergitLinkPreview/1.0',
        accept,
      },
      signal: abortController.signal,
      redirect: 'manual',
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

async function readTextWithLimit(
  response: Response,
  maxBytes: number,
  shouldStop?: (content: string) => boolean,
): Promise<HeadReadResult> {
  if (!response.body) {
    return {
      content: '',
      truncated: false,
    }
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let content = ''
  let received = 0
  let shouldCancel = false
  let truncated = false

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (!value) continue

      received += value.byteLength
      if (received > maxBytes) {
        truncated = true
        shouldCancel = true
        break
      }

      content += decoder.decode(value, { stream: true })

      if (shouldStop && shouldStop(content)) {
        shouldCancel = true
        break
      }
    }
  } catch {
    shouldCancel = true
    throw new Error('response_read_failed')
  } finally {
    content += decoder.decode()
    if (shouldCancel) {
      try {
        await reader.cancel()
      } catch {
        // noop
      }
    }
  }

  return {
    content,
    truncated,
  }
}

function isRedirectStatus(statusCode: number): boolean {
  return [301, 302, 303, 307, 308].includes(statusCode)
}

function pruneExpiredCacheEntries(nowMs: number): number {
  let removed = 0
  for (const [key, value] of previewCache.entries()) {
    if (value.expiresAtMs > nowMs) continue
    previewCache.delete(key)
    removed += 1
  }
  return removed
}

function enforcePreviewCacheSize(maxEntries: number): number {
  if (previewCache.size <= maxEntries) return 0
  let removed = 0
  for (const key of previewCache.keys()) {
    if (previewCache.size <= maxEntries) break
    previewCache.delete(key)
    removed += 1
  }
  return removed
}

async function fetchWithRedirectValidation(
  initialUrl: URL,
  timeoutMs: number,
  accept: string,
  maxRedirects: number,
): Promise<FetchWithRedirectValidationResult> {
  let currentUrl = new URL(initialUrl.toString())
  let redirectCount = 0

  while (true) {
    try {
      await assertPublicHostname(currentUrl.hostname)
    } catch {
      return {
        response: null,
        resolvedUrl: currentUrl,
        reason: UnfurlFailureReason.RedirectBlocked,
        redirectCount,
      }
    }

    let response: Response
    try {
      response = await fetchWithTimeout(currentUrl, timeoutMs, accept)
    } catch {
      return {
        response: null,
        resolvedUrl: currentUrl,
        reason: UnfurlFailureReason.FetchFailed,
        redirectCount,
      }
    }

    if (!isRedirectStatus(response.status)) {
      return {
        response,
        resolvedUrl: currentUrl,
        reason: null,
        redirectCount,
      }
    }

    const locationHeader = response.headers.get('location')?.trim() ?? ''
    if (!locationHeader) {
      return {
        response: null,
        resolvedUrl: currentUrl,
        reason: UnfurlFailureReason.FetchNotOk,
        redirectCount,
      }
    }

    if (redirectCount >= maxRedirects) {
      return {
        response: null,
        resolvedUrl: currentUrl,
        reason: UnfurlFailureReason.RedirectLimitExceeded,
        redirectCount,
      }
    }

    let nextUrl: URL
    try {
      nextUrl = new URL(locationHeader, currentUrl)
    } catch {
      return {
        response: null,
        resolvedUrl: currentUrl,
        reason: UnfurlFailureReason.RedirectBlocked,
        redirectCount,
      }
    }

    if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') {
      return {
        response: null,
        resolvedUrl: currentUrl,
        reason: UnfurlFailureReason.RedirectBlocked,
        redirectCount,
      }
    }

    redirectCount += 1
    currentUrl = nextUrl
  }
}

function absolutizeUrl(raw: string, base: URL): string {
  if (!raw) return ''
  try {
    return new URL(raw, base).toString()
  } catch {
    return ''
  }
}

function parsePreviewFromHtml(html: string, resolvedUrl: URL): LinkPreviewResponse {
  const ogTitle = getMetaContent(html, ['og:title', 'twitter:title'])
  const ogDescription = getMetaContent(html, ['og:description', 'description', 'twitter:description'])
  const ogImage = getMetaContent(html, ['og:image', 'twitter:image'])
  const ogSite = getMetaContent(html, ['og:site_name'])

  const title = normalizeText(ogTitle || getTitleContent(html), 180)
  const description = normalizeText(ogDescription, 500)
  const siteName = normalizeText(ogSite || resolvedUrl.hostname, 120)
  const imageUrl = absolutizeUrl(normalizeText(ogImage, 2048), resolvedUrl)

  return {
    url: resolvedUrl.toString(),
    title,
    description,
    siteName,
    imageUrl,
  }
}

function isPreviewUseful(preview: LinkPreviewResponse): boolean {
  return preview.title.length > 0 || preview.description.length > 0 || preview.imageUrl.length > 0
}

function extractOEmbedUrl(html: string, resolvedUrl: URL): string {
  for (const tag of html.match(LINK_TAG_REGEX) ?? []) {
    const attrs = parseTagAttributes(tag)
    const relTokens = (attrs.rel ?? '').toLowerCase().split(/\s+/).filter(Boolean)
    if (!relTokens.includes('alternate')) continue

    const typeValue = (attrs.type ?? '').toLowerCase()
    if (!typeValue.includes('json+oembed')) continue

    const href = attrs.href?.trim() ?? ''
    if (!href) continue

    const absolute = absolutizeUrl(href, resolvedUrl)
    if (absolute) return absolute
  }

  return ''
}

function getStringValue(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  return typeof value === 'string' ? value : ''
}

function parseOEmbedPreview(
  payload: Record<string, unknown>,
  resolvedOEmbedUrl: URL,
): Partial<LinkPreviewResponse> {
  const title = normalizeText(getStringValue(payload, 'title'), 180)
  const description = normalizeText(getStringValue(payload, 'author_name'), 500)
  const siteName = normalizeText(getStringValue(payload, 'provider_name'), 120)

  const thumbnail =
    getStringValue(payload, 'thumbnail_url') ||
    getStringValue(payload, 'thumbnail_url_with_play_button')
  const imageUrl = absolutizeUrl(normalizeText(thumbnail, 2048), resolvedOEmbedUrl)

  return {
    title,
    description,
    siteName,
    imageUrl,
  }
}

function mergePreview(
  basePreview: LinkPreviewResponse,
  oembedPreview: Partial<LinkPreviewResponse> | null,
  resolvedUrl: URL,
): LinkPreviewResponse {
  return {
    url: basePreview.url || resolvedUrl.toString(),
    title: basePreview.title || oembedPreview?.title || '',
    description: basePreview.description || oembedPreview?.description || '',
    siteName: basePreview.siteName || oembedPreview?.siteName || normalizeText(resolvedUrl.hostname, 120),
    imageUrl: basePreview.imageUrl || oembedPreview?.imageUrl || '',
  }
}

function isH3Error(error: unknown): error is { statusCode?: number } {
  return Boolean(error && typeof error === 'object' && 'statusCode' in error)
}

async function fetchOEmbedPreview(
  discoveredUrl: string,
  timeoutMs: number,
  maxOEmbedBytes: number,
  maxRedirects: number,
): Promise<Partial<LinkPreviewResponse> | null> {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(discoveredUrl)
  } catch {
    return null
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return null
  }

  const fetchResult = await fetchWithRedirectValidation(
    parsedUrl,
    timeoutMs,
    'application/json,text/json,*/*',
    maxRedirects,
  )

  if (!fetchResult.response || fetchResult.reason !== null) {
    if (fetchResult.reason === UnfurlFailureReason.RedirectBlocked) {
      logLinkPreview('redirect_blocked', {
        url: parsedUrl.toString(),
        phase: 'oembed',
        redirects: fetchResult.redirectCount,
      })
    }
    return null
  }
  const response = fetchResult.response

  if (!response.ok) return null

  let resolvedUrl: URL
  try {
    resolvedUrl = new URL(response.url || fetchResult.resolvedUrl.toString())
    await assertPublicHostname(resolvedUrl.hostname)
  } catch {
    return null
  }

  try {
    const bodyRead = await readTextWithLimit(response, maxOEmbedBytes)
    if (bodyRead.truncated) return null
    const body = bodyRead.content
    if (!body.trim()) return null
    const payload = JSON.parse(body)
    if (!payload || typeof payload !== 'object') return null
    return parseOEmbedPreview(payload as Record<string, unknown>, resolvedUrl)
  } catch {
    return null
  }
}

async function buildPreview(
  parsedUrl: URL,
  timeoutMs: number,
  maxHeadBytes: number,
  maxOEmbedBytes: number,
  maxRedirects: number,
): Promise<UnfurlResult> {
  const fetchResult = await fetchWithRedirectValidation(
    parsedUrl,
    timeoutMs,
    'text/html,application/xhtml+xml',
    maxRedirects,
  )
  if (!fetchResult.response) {
    if (fetchResult.reason === UnfurlFailureReason.RedirectBlocked) {
      logLinkPreview('redirect_blocked', {
        url: parsedUrl.toString(),
        phase: 'html',
        redirects: fetchResult.redirectCount,
      })
    }
    return {
      preview: null,
      reason: fetchResult.reason ?? UnfurlFailureReason.FetchFailed,
    }
  }
  const response = fetchResult.response

  if (!response.ok) {
    return {
      preview: null,
      reason: UnfurlFailureReason.FetchNotOk,
    }
  }

  let resolvedUrl: URL
  try {
    resolvedUrl = new URL(response.url || fetchResult.resolvedUrl.toString())
    await assertPublicHostnameOrThrow(resolvedUrl.hostname)
  } catch {
    return {
      preview: null,
      reason: UnfurlFailureReason.RedirectBlocked,
    }
  }

  const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
  if (!contentType.includes('text/html')) {
    return {
      preview: null,
      reason: UnfurlFailureReason.UnsupportedContentType,
    }
  }

  let headRead: HeadReadResult
  try {
    headRead = await readTextWithLimit(
      response,
      maxHeadBytes,
      (content) => HEAD_CLOSE_REGEX.test(content) || hasEnoughHeadMetadata(content),
    )
  } catch {
    return {
      preview: null,
      reason: UnfurlFailureReason.HeadReadFailed,
    }
  }
  if (headRead.truncated) {
    logLinkPreview('head_truncated', {
      url: resolvedUrl.toString(),
      maxHeadBytes,
    })
  }
  const headFragment = headRead.content

  const parsedHtmlPreview = parsePreviewFromHtml(headFragment, resolvedUrl)
  const oEmbedUrl = extractOEmbedUrl(headFragment, resolvedUrl)
  const oEmbedPreview = oEmbedUrl
    ? await fetchOEmbedPreview(oEmbedUrl, timeoutMs, maxOEmbedBytes, maxRedirects)
    : null

  const mergedPreview = mergePreview(parsedHtmlPreview, oEmbedPreview, resolvedUrl)
  if (!isPreviewUseful(mergedPreview)) {
    return {
      preview: null,
      reason: headRead.truncated ? UnfurlFailureReason.HeadTruncated : UnfurlFailureReason.MetadataMissing,
    }
  }

  return {
    preview: mergedPreview,
    reason: null,
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody<LinkPreviewRequest>(event)
  const channelId = body.channelId?.trim() ?? ''
  await requireChatMembership(event, channelId)

  const rawUrl = body.url?.trim() ?? ''
  if (!rawUrl) {
    throw createError({
      statusCode: 400,
      statusMessage: 'url is required',
    })
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(rawUrl)
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid URL',
    })
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Only http/https URLs are allowed',
    })
  }

  parsedUrl.hash = ''
  await assertPublicHostnameOrThrow(parsedUrl.hostname)

  const cacheKey = parsedUrl.toString()
  const now = Date.now()
  pruneExpiredCacheEntries(now)
  const cached = previewCache.get(cacheKey)
  if (cached && cached.expiresAtMs > now) {
    logLinkPreview('cache_hit', {
      url: cacheKey,
    })
    return {
      preview: cached.value,
      cached: true,
    }
  }

  const config = useRuntimeConfig(event)
  const timeoutMs = Math.max(Number(config.chatLinkPreviewTimeoutMs ?? 3000), 500)
  const cacheTtlMs = Math.max(Number(config.chatLinkPreviewCacheTtlSec ?? 900), 1) * 1000
  const maxHeadBytes = Math.max(Number(config.chatLinkPreviewMaxHeadBytes ?? MAX_HTML_BYTES), 8 * 1024)
  const maxOEmbedBytes = Math.max(Number(config.chatLinkPreviewMaxOembedBytes ?? MAX_OEMBED_BYTES), 8 * 1024)
  const maxRedirects = Math.max(Number(config.chatLinkPreviewMaxRedirects ?? DEFAULT_MAX_REDIRECTS), 0)
  const cacheMaxEntries = Math.max(Number(config.chatLinkPreviewCacheMaxEntries ?? DEFAULT_CACHE_MAX_ENTRIES), 1)

  let result: UnfurlResult
  try {
    result = await buildPreview(parsedUrl, timeoutMs, maxHeadBytes, maxOEmbedBytes, maxRedirects)
  } catch (error) {
    if (isH3Error(error)) {
      throw error
    }
    result = {
      preview: null,
      reason: UnfurlFailureReason.UnexpectedError,
    }
  }

  const expiresAtMs =
    now + (result.preview ? cacheTtlMs : Math.min(cacheTtlMs, NEGATIVE_CACHE_TTL_MS))

  previewCache.set(cacheKey, {
    value: result.preview,
    expiresAtMs,
  })
  const evictedCount = enforcePreviewCacheSize(cacheMaxEntries)
  if (evictedCount > 0) {
    logLinkPreview('cache_evict', {
      removed: evictedCount,
      maxEntries: cacheMaxEntries,
      size: previewCache.size,
    })
  }

  if (!result.preview && result.reason) {
    logLinkPreview('preview_unavailable', {
      url: cacheKey,
      reason: result.reason,
    })
  }

  return {
    preview: result.preview,
    cached: false,
  }
})
