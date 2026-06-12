<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useToast } from '~/composables/useToast'
import { useAppStore } from '~/stores/app'
import {
  ChatAttachmentKind,
  type ChatMessageAttachmentSignedUrlResolver,
  type ChatMessageAttachment,
} from '@/src/features/messages/types'

type AttachmentContextMenuState = {
  x: number
  y: number
  attachment: ChatMessageAttachment
}

const CONTEXT_MENU_WIDTH = 190
const CONTEXT_MENU_HEIGHT = 116
const SIGNED_URL_RETRY_LIMIT = 1

type AttachmentViewerState = {
  attachment: ChatMessageAttachment
  signedUrl: string
}

class AttachmentRequestError extends Error {
  statusCode: number
  details: string

  constructor(message: string, statusCode: number, details = '') {
    super(message)
    this.name = 'AttachmentRequestError'
    this.statusCode = statusCode
    this.details = details
  }
}

const props = defineProps<{
  channelId: string
  attachments: ChatMessageAttachment[]
  resolveSignedUrl: ChatMessageAttachmentSignedUrlResolver
}>()

const app = useAppStore()
const toast = useToast()
const hasAttachments = computed(() => props.attachments.length > 0)
const contextMenu = ref<AttachmentContextMenuState | null>(null)
const contextMenuRef = ref<HTMLElement | null>(null)
const viewerAttachment = ref<AttachmentViewerState | null>(null)
const isSaving = ref(false)
const imageSourceOverrides = ref<Record<string, string>>({})
const imagePreviewLoading = ref<Record<string, true>>({})
const imagePreviewRetryAttempted = ref<Record<string, true>>({})
const imagePreviewUnavailable = ref<Record<string, true>>({})
const imagePreviewLoadInFlight = new Map<string, Promise<string>>()

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getAttachmentDisplayName(attachment: ChatMessageAttachment): string {
  const byDisplayName = (attachment.displayName ?? '').trim()
  if (byDisplayName) return byDisplayName
  const key = attachment.storageKey ?? ''
  const lastSegment = key.split('/').pop() ?? ''
  if (!lastSegment) return 'attachment'
  const firstDash = lastSegment.indexOf('-')
  if (firstDash <= 0 || firstDash >= lastSegment.length - 1) return lastSegment
  return lastSegment.slice(firstDash + 1)
}

function closeContextMenu() {
  contextMenu.value = null
}

function closeImageViewer() {
  viewerAttachment.value = null
}

function attachmentKey(attachment: ChatMessageAttachment): string {
  const id = attachment.id?.trim() || 'unknown'
  const storageKey = attachment.storageKey?.trim() || 'missing'
  return `${id}:${storageKey}`
}

function attachmentDisplayUrl(attachment: ChatMessageAttachment): string {
  const key = attachmentKey(attachment)
  const override = imageSourceOverrides.value[key]
  if (override) return override

  return app.getCachedAttachmentPreviewObjectUrl(props.channelId, attachment.storageKey)
}

function setImageSourceOverride(attachment: ChatMessageAttachment, objectUrl: string) {
  const key = attachmentKey(attachment)
  if (!objectUrl || imageSourceOverrides.value[key] === objectUrl) return
  imageSourceOverrides.value = {
    ...imageSourceOverrides.value,
    [key]: objectUrl,
  }
}

function clearImageSourceOverride(attachment: ChatMessageAttachment) {
  const key = attachmentKey(attachment)
  if (!imageSourceOverrides.value[key]) return
  const next = { ...imageSourceOverrides.value }
  delete next[key]
  imageSourceOverrides.value = next
}

function setImagePreviewLoading(attachment: ChatMessageAttachment, loading: boolean) {
  const key = attachmentKey(attachment)
  if (loading) {
    imagePreviewLoading.value = {
      ...imagePreviewLoading.value,
      [key]: true,
    }
    return
  }

  if (!imagePreviewLoading.value[key]) return
  const next = { ...imagePreviewLoading.value }
  delete next[key]
  imagePreviewLoading.value = next
}

function isImagePreviewLoading(attachment: ChatMessageAttachment): boolean {
  return Boolean(imagePreviewLoading.value[attachmentKey(attachment)])
}

function setImagePreviewUnavailable(attachment: ChatMessageAttachment, unavailable: boolean) {
  const key = attachmentKey(attachment)
  if (unavailable) {
    imagePreviewUnavailable.value = {
      ...imagePreviewUnavailable.value,
      [key]: true,
    }
    return
  }

  if (!imagePreviewUnavailable.value[key]) return
  const next = { ...imagePreviewUnavailable.value }
  delete next[key]
  imagePreviewUnavailable.value = next
}

function isImagePreviewUnavailable(attachment: ChatMessageAttachment): boolean {
  return Boolean(imagePreviewUnavailable.value[attachmentKey(attachment)])
}

function isAuthExpiryFailure(error: unknown): boolean {
  if (error instanceof AttachmentRequestError) {
    if ([400, 401, 403].includes(error.statusCode)) return true
    const details = `${error.message} ${error.details}`.toLowerCase()
    return details.includes('invalidjwt') || details.includes('exp') || details.includes('token')
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return message.includes('invalidjwt') || message.includes('exp') || message.includes('token')
  }
  return false
}

async function safeReadResponseText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ''
  }
}

async function resolveSignedUrl(
  attachment: ChatMessageAttachment,
  forceRefresh = false,
): Promise<string> {
  if (!forceRefresh) {
    const fromAttachment = attachment.signedUrl?.trim() ?? ''
    if (fromAttachment) return fromAttachment

    const cachedSignedUrl = app.getCachedSignedAttachmentUrl(props.channelId, attachment.storageKey)
    if (cachedSignedUrl) return cachedSignedUrl
  }

  const resolved = await props.resolveSignedUrl(attachment, { forceRefresh })
  if (resolved) {
    setImagePreviewUnavailable(attachment, false)
    return resolved
  }
  return ''
}

async function probeSignedUrl(signedUrl: string): Promise<void> {
  const response = await fetch(signedUrl, {
    method: 'HEAD',
    mode: 'cors',
    credentials: 'omit',
  })
  if (response.ok || response.status === 405 || response.status === 501) {
    return
  }
  const details = await safeReadResponseText(response)
  throw new AttachmentRequestError(
    `Attachment probe failed (${response.status})`,
    response.status,
    details,
  )
}

async function fetchAttachmentBlob(signedUrl: string): Promise<Blob> {
  const response = await fetch(signedUrl, {
    method: 'GET',
    mode: 'cors',
    credentials: 'omit',
  })
  if (!response.ok) {
    const details = await safeReadResponseText(response)
    throw new AttachmentRequestError(
      `Attachment download failed (${response.status})`,
      response.status,
      details,
    )
  }
  return response.blob()
}

async function loadInlineImagePreview(
  attachment: ChatMessageAttachment,
  forceRefresh = false,
): Promise<string> {
  const key = attachmentKey(attachment)
  const pending = imagePreviewLoadInFlight.get(key)
  if (pending) return pending

  const request = (async () => {
    const cachedObjectUrl = app.getCachedAttachmentPreviewObjectUrl(props.channelId, attachment.storageKey)
    if (cachedObjectUrl) {
      setImageSourceOverride(attachment, cachedObjectUrl)
      setImagePreviewUnavailable(attachment, false)
      return cachedObjectUrl
    }

    setImagePreviewLoading(attachment, true)
    try {
      let attempt = 0
      let refreshSignedUrl = forceRefresh

      while (attempt <= SIGNED_URL_RETRY_LIMIT) {
        const signedUrl = await resolveSignedUrl(attachment, refreshSignedUrl)
        if (!signedUrl) return ''

        try {
          const blob = await fetchAttachmentBlob(signedUrl)
          const objectUrl = URL.createObjectURL(blob)
          const cached = app.cacheAttachmentPreviewObjectUrl(
            props.channelId,
            attachment.storageKey,
            objectUrl,
            blob.size,
          )
          setImageSourceOverride(attachment, cached)
          setImagePreviewUnavailable(attachment, false)
          return cached
        } catch (error) {
          if (attempt >= SIGNED_URL_RETRY_LIMIT || !isAuthExpiryFailure(error)) throw error
          refreshSignedUrl = true
          attempt += 1
        }
      }

      return ''
    } finally {
      setImagePreviewLoading(attachment, false)
    }
  })()

  imagePreviewLoadInFlight.set(key, request)
  try {
    return await request
  } finally {
    imagePreviewLoadInFlight.delete(key)
  }
}

async function resolveSignedUrlForAction(attachment: ChatMessageAttachment): Promise<string> {
  let attempt = 0
  let forceRefresh = false

  while (attempt <= SIGNED_URL_RETRY_LIMIT) {
    const signedUrl = await resolveSignedUrl(attachment, forceRefresh)
    if (!signedUrl) return ''

    try {
      await probeSignedUrl(signedUrl)
      return signedUrl
    } catch (error) {
      if (attempt >= SIGNED_URL_RETRY_LIMIT || !isAuthExpiryFailure(error)) throw error
      forceRefresh = true
      attempt += 1
    }
  }

  return ''
}

async function openImageViewer(attachment: ChatMessageAttachment) {
  closeContextMenu()
  try {
    const signedUrl = await resolveSignedUrlForAction(attachment)
    if (!signedUrl) {
      toast.show('Dosya baglantisi henuz hazir degil', 'info')
      return
    }
    viewerAttachment.value = {
      attachment,
      signedUrl,
    }
  } catch {
    toast.show('Resim baglantisi yenilenemedi', 'error')
  }
}

async function openAttachmentInNewTab(attachment: ChatMessageAttachment) {
  closeContextMenu()
  try {
    const signedUrl = await resolveSignedUrlForAction(attachment)
    if (!signedUrl) {
      toast.show('Dosya baglantisi henuz hazir degil', 'info')
      return
    }
    window.open(signedUrl, '_blank', 'noopener,noreferrer')
  } catch {
    toast.show('Dosya acilamadi, baglanti yenilenemedi', 'error')
  }
}

async function downloadAttachment(attachment: ChatMessageAttachment) {
  if (isSaving.value) return
  isSaving.value = true
  closeContextMenu()

  try {
    let signedUrl = await resolveSignedUrl(attachment, false)
    if (!signedUrl) {
      toast.show('Dosya baglantisi henuz hazir degil', 'info')
      return
    }

    let blob: Blob
    try {
      blob = await fetchAttachmentBlob(signedUrl)
    } catch (error) {
      if (!isAuthExpiryFailure(error)) throw error
      signedUrl = await resolveSignedUrl(attachment, true)
      if (!signedUrl) {
        toast.show('Dosya baglantisi yenilenemedi', 'error')
        return
      }
      blob = await fetchAttachmentBlob(signedUrl)
    }

    const downloadUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = downloadUrl
    anchor.download = getAttachmentDisplayName(attachment)
    anchor.rel = 'noopener'
    anchor.style.display = 'none'

    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()

    window.setTimeout(() => {
      URL.revokeObjectURL(downloadUrl)
    }, 0)
  } catch {
    toast.show('Dosya indirilemedi, tekrar dene', 'error')
  } finally {
    isSaving.value = false
  }
}

function downloadViewerAttachment() {
  if (!viewerAttachment.value) return
  void downloadAttachment(viewerAttachment.value.attachment)
}

function openViewerAttachmentInNewTab() {
  if (!viewerAttachment.value) return
  void openAttachmentInNewTab(viewerAttachment.value.attachment)
}

async function onInlineImageError(attachment: ChatMessageAttachment) {
  const key = attachmentKey(attachment)
  if (imagePreviewRetryAttempted.value[key]) {
    app.removeCachedAttachmentPreviewObjectUrl(props.channelId, attachment.storageKey)
    clearImageSourceOverride(attachment)
    setImagePreviewUnavailable(attachment, true)
    return
  }

  imagePreviewRetryAttempted.value = {
    ...imagePreviewRetryAttempted.value,
    [key]: true,
  }

  app.removeCachedAttachmentPreviewObjectUrl(props.channelId, attachment.storageKey)
  clearImageSourceOverride(attachment)

  try {
    const objectUrl = await loadInlineImagePreview(attachment, true)
    if (!objectUrl) {
      setImagePreviewUnavailable(attachment, true)
      return
    }
  } catch {
    setImagePreviewUnavailable(attachment, true)
  }
}

async function onViewerImageError() {
  const current = viewerAttachment.value
  if (!current) return
  try {
    const signedUrl = await resolveSignedUrl(current.attachment, true)
    if (!signedUrl || signedUrl === current.signedUrl) {
      toast.show('Resim onizlemesi kullanilamiyor', 'info')
      closeImageViewer()
      return
    }
    viewerAttachment.value = {
      attachment: current.attachment,
      signedUrl,
    }
  } catch {
    toast.show('Resim onizlemesi kullanilamiyor', 'info')
    closeImageViewer()
  }
}

function resolveContextMenuPosition(event: MouseEvent): { x: number; y: number } {
  if (typeof window === 'undefined') {
    return {
      x: event.clientX,
      y: event.clientY,
    }
  }

  const maxX = Math.max(8, window.innerWidth - CONTEXT_MENU_WIDTH - 8)
  const maxY = Math.max(8, window.innerHeight - CONTEXT_MENU_HEIGHT - 8)
  return {
    x: Math.min(Math.max(8, event.clientX), maxX),
    y: Math.min(Math.max(8, event.clientY), maxY),
  }
}

function onAttachmentContextMenu(event: MouseEvent, attachment: ChatMessageAttachment) {
  event.preventDefault()
  const { x, y } = resolveContextMenuPosition(event)
  contextMenu.value = {
    x,
    y,
    attachment,
  }
}

function onGlobalPointerDown(event: PointerEvent) {
  if (!contextMenu.value) return
  const target = event.target as Node | null
  if (target && contextMenuRef.value?.contains(target)) return
  closeContextMenu()
}

function onGlobalScroll() {
  closeContextMenu()
}

function onGlobalKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  closeContextMenu()
  closeImageViewer()
}

const pruneAttachmentState = () => {
  const activeKeys = new Set(props.attachments.map(attachmentKey))

  const pruneRecord = <T>(record: Record<string, T>) => {
    const next: Record<string, T> = {}
    for (const [key, value] of Object.entries(record)) {
      if (activeKeys.has(key)) {
        next[key] = value
      }
    }
    return next
  }

  imageSourceOverrides.value = pruneRecord(imageSourceOverrides.value)
  imagePreviewLoading.value = pruneRecord(imagePreviewLoading.value)
  imagePreviewRetryAttempted.value = pruneRecord(imagePreviewRetryAttempted.value)
  imagePreviewUnavailable.value = pruneRecord(imagePreviewUnavailable.value)
}

const primeInlineImagePreviews = () => {
  for (const attachment of props.attachments) {
    if (attachment.kind !== ChatAttachmentKind.Image || isImagePreviewUnavailable(attachment)) continue
    if (attachmentDisplayUrl(attachment)) continue
    const signedUrl = attachment.signedUrl?.trim() || app.getCachedSignedAttachmentUrl(props.channelId, attachment.storageKey)
    if (!signedUrl) continue
    void loadInlineImagePreview({
      ...attachment,
      signedUrl,
    }).catch(() => {
      setImagePreviewUnavailable(attachment, true)
    })
  }
}

watch(
  () => [
    props.channelId,
    props.attachments.map((attachment) => (
      `${attachmentKey(attachment)}:${attachment.kind}:${attachment.signedUrl ?? ''}`
    )).join('|'),
  ],
  () => {
    pruneAttachmentState()
    primeInlineImagePreviews()
  },
  { immediate: true },
)

onMounted(() => {
  if (typeof window === 'undefined') return
  window.addEventListener('pointerdown', onGlobalPointerDown)
  window.addEventListener('scroll', onGlobalScroll, true)
  window.addEventListener('keydown', onGlobalKeydown)
})

onBeforeUnmount(() => {
  if (typeof window === 'undefined') return
  window.removeEventListener('pointerdown', onGlobalPointerDown)
  window.removeEventListener('scroll', onGlobalScroll, true)
  window.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<template>
  <div v-if="hasAttachments" class="chat-attachment-list">
    <article
      v-for="attachment in attachments"
      :key="attachment.id"
      class="chat-attachment-item"
      :class="{
        'chat-attachment-item--image': attachment.kind === ChatAttachmentKind.Image,
      }"
      @contextmenu="onAttachmentContextMenu($event, attachment)"
    >
      <template v-if="attachment.kind === ChatAttachmentKind.Image">
        <button
          class="chat-attachment-item__image-button"
          type="button"
          @click="void openImageViewer(attachment)"
        >
          <img
            v-if="attachmentDisplayUrl(attachment) && !isImagePreviewUnavailable(attachment)"
            class="chat-attachment-item__image"
            :src="attachmentDisplayUrl(attachment)"
            :alt="attachment.displayName || 'Mesaj gorseli'"
            loading="lazy"
            decoding="async"
            @error="void onInlineImageError(attachment)"
          />
          <span v-else-if="isImagePreviewLoading(attachment)" class="chat-attachment-item__image-fallback">
            Resim onizlemesi yukleniyor...
          </span>
          <span v-else class="chat-attachment-item__image-fallback">
            {{
              isImagePreviewUnavailable(attachment)
                ? 'Resim onizlemesi kullanilamiyor. Acmak icin tikla.'
                : 'Resim onizlemesi hazirlaniyor...'
            }}
          </span>
        </button>
      </template>

      <template v-else>
        <button class="chat-attachment-item__file-link" type="button" @click="void openAttachmentInNewTab(attachment)">
          <span class="chat-attachment-item__file-name">{{ attachment.displayName || 'Dosya' }}</span>
          <span class="chat-attachment-item__file-meta">
            {{ attachment.mimeType || 'application/octet-stream' }}
            <template v-if="attachment.sizeBytes > 0"> · {{ formatSize(attachment.sizeBytes) }}</template>
          </span>
        </button>
      </template>
    </article>
  </div>

  <Teleport to="body">
    <div
      v-if="contextMenu"
      ref="contextMenuRef"
      class="chat-attachment-context-menu"
      :style="{
        left: `${contextMenu.x}px`,
        top: `${contextMenu.y}px`,
      }"
    >
      <button
        v-if="contextMenu.attachment.kind === ChatAttachmentKind.Image"
        type="button"
        class="chat-attachment-context-menu__item"
        @click="void openImageViewer(contextMenu.attachment)"
      >
        Ekranda ac
      </button>
      <button
        type="button"
        class="chat-attachment-context-menu__item"
        @click="void openAttachmentInNewTab(contextMenu.attachment)"
      >
        Yeni sekmede ac
      </button>
      <button
        type="button"
        class="chat-attachment-context-menu__item"
        :disabled="isSaving"
        @click="void downloadAttachment(contextMenu.attachment)"
      >
        {{ contextMenu.attachment.kind === ChatAttachmentKind.Image ? 'Resmi kaydet' : 'Dosyayi kaydet' }}
      </button>
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="viewerAttachment"
      class="chat-image-viewer"
      @click.self="closeImageViewer"
    >
      <button
        class="chat-image-viewer__close"
        type="button"
        aria-label="Resim onizlemeyi kapat"
        @click="closeImageViewer"
      >
        x
      </button>

      <img
        class="chat-image-viewer__image"
        :src="viewerAttachment.signedUrl"
        :alt="viewerAttachment.attachment.displayName || 'Resim onizleme'"
        @error="void onViewerImageError"
      />

      <div class="chat-image-viewer__actions">
        <button type="button" class="chat-image-viewer__action" @click="downloadViewerAttachment">
          Resmi kaydet
        </button>
        <button type="button" class="chat-image-viewer__action" @click="openViewerAttachmentInNewTab">
          Yeni sekmede ac
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.chat-attachment-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
  width: 100%;
  min-width: 0;
  max-width: 100%;
}

.chat-attachment-item {
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.42);
  overflow: hidden;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}

.chat-attachment-item__image-button {
  border: none;
  padding: 0;
  margin: 0;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  background: transparent;
  cursor: zoom-in;
  display: block;
  box-sizing: border-box;
}

.chat-attachment-item__image {
  display: block;
  width: 100%;
  max-width: 100%;
  max-height: 320px;
  height: auto;
  object-fit: contain;
  background: rgba(2, 6, 23, 0.54);
}

.chat-attachment-item__file-link {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: none;
  background: transparent;
  text-decoration: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.chat-attachment-item__image-fallback {
  display: block;
  padding: 14px 12px;
  font-size: 12px;
  color: rgba(226, 232, 240, 0.86);
  text-align: left;
}

.chat-attachment-item__file-name {
  font-size: 13px;
  font-weight: 600;
  color: inherit;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.chat-attachment-item__file-meta {
  font-size: 11px;
  opacity: 0.78;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.chat-attachment-context-menu {
  position: fixed;
  z-index: 2200;
  min-width: 170px;
  display: flex;
  flex-direction: column;
  padding: 6px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(8, 16, 36, 0.96);
  box-shadow: 0 16px 38px rgba(2, 6, 23, 0.48);
}

.chat-attachment-context-menu__item {
  border: none;
  background: transparent;
  color: #d6deee;
  text-align: left;
  padding: 7px 10px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
}

.chat-attachment-context-menu__item:hover:not(:disabled) {
  background: rgba(148, 163, 184, 0.17);
}

.chat-attachment-context-menu__item:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.chat-image-viewer {
  position: fixed;
  inset: 0;
  z-index: 2300;
  display: grid;
  grid-template-rows: auto 1fr auto;
  align-items: center;
  justify-items: center;
  gap: 14px;
  padding: 24px;
  background: rgba(2, 6, 23, 0.88);
  backdrop-filter: blur(3px);
}

.chat-image-viewer__close {
  justify-self: end;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(15, 23, 42, 0.86);
  color: #e2e8f0;
  cursor: pointer;
  font-size: 16px;
}

.chat-image-viewer__image {
  max-width: min(92vw, 1200px);
  max-height: min(78vh, 860px);
  width: auto;
  height: auto;
  border-radius: 12px;
  object-fit: contain;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(2, 6, 23, 0.7);
}

.chat-image-viewer__actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.chat-image-viewer__action {
  height: 34px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(15, 23, 42, 0.86);
  color: #e2e8f0;
  padding: 0 14px;
  cursor: pointer;
  font-size: 12px;
}

.chat-image-viewer__action:hover,
.chat-image-viewer__close:hover {
  border-color: rgba(34, 211, 238, 0.6);
}

@media (max-width: 1023px) {
  .chat-attachment-item__image {
    max-height: 240px;
  }

  .chat-image-viewer {
    padding: 14px;
  }

  .chat-image-viewer__image {
    max-width: 94vw;
    max-height: 72vh;
  }
}
</style>
