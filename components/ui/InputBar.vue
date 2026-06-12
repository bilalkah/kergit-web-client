<script setup lang="ts">
import MessageComposerShell from '~/components/ui/messages/composer/MessageComposerShell.vue'
import { SocketState, useWebSocket } from '~/composables/useWebSocket'
import { useAppStore } from '~/stores/app'
import { useToast } from '~/composables/useToast'
import { devError, devWarn } from '@/src/utils/safeLogger'
import {
  extractFirstHttpUrl,
} from '@/src/features/messages/richText'
import {
  ChatAttachmentKind,
  ChatComposerAttachmentUploadStatus,
  type ChatComposerAttachmentDraft,
  type ChatMessageAttachment,
  type ChatMessageLinkPreview,
} from '@/src/features/messages/types'

const TYPING_RESEND_INTERVAL_MS = 3000
const LINK_PREVIEW_DEBOUNCE_MS = 420
const DEFAULT_MAX_FILES = 6
const DEFAULT_MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024
const LINK_PREVIEW_UNAVAILABLE_MESSAGE = 'Baglanti onizlemesi kullanilamiyor'

const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
  'application/pdf',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed',
])
const DIRECT_IMAGE_URL_EXTENSION_REGEX = /\.(png|jpe?g|webp|gif|avif)$/i

const message = ref('')
const socket = useWebSocket()
const app = useAppStore()
const toast = useToast()
const runtimeConfig = useRuntimeConfig()
const isTyping = ref(false)
const typingHubId = ref<string | null>(null)
const typingChannelId = ref<string | null>(null)
const draftsByChannel = ref<Record<string, string>>({})
const draftsAttachmentsByChannel = ref<Record<string, ChatComposerAttachmentDraft[]>>({})
const draftPreviewByChannel = ref<Record<string, ChatMessageLinkPreview | null>>({})
const draftPreviewUrlByChannel = ref<Record<string, string>>({})
const draftPreviewLoadingByChannel = ref<Record<string, boolean>>({})
const draftPreviewErrorByChannel = ref<Record<string, string>>({})
const previewCache = new Map<string, ChatMessageLinkPreview>()
const suppressTyping = ref(false)
const typingIntervalId = ref<ReturnType<typeof setInterval> | null>(null)
const isSending = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

let previewDebounceId: ReturnType<typeof setTimeout> | null = null
let previewAbort: AbortController | null = null

const maxFilesPerMessage = computed(() => {
  const raw = Number(runtimeConfig.public.chatAttachmentMaxFiles ?? DEFAULT_MAX_FILES)
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_MAX_FILES
  return Math.floor(raw)
})

const maxFileSizeBytes = computed(() => {
  const raw = Number(runtimeConfig.public.chatAttachmentMaxSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES)
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_MAX_FILE_SIZE_BYTES
  return Math.floor(raw)
})

const fileAccept = Array.from(ALLOWED_UPLOAD_MIME_TYPES).join(',')

const placeholder = computed(() => {
  const channelName = app.activeChannel?.name?.trim()
  if (!channelName) return 'Bir kanala mesaj gonder'
  return `#${channelName} kanalina mesaj gonder`
})

const draftKey = (hubId: string | null, channelId: string | null) => {
  if (!hubId || !channelId) return null
  return `${hubId}:${channelId}`
}

const activeDraftKey = computed(() => draftKey(app.activeHubId, app.activeChannelId))

const currentAttachments = computed<ChatComposerAttachmentDraft[]>(() => {
  const key = activeDraftKey.value
  if (!key) return []
  return draftsAttachmentsByChannel.value[key] ?? []
})

const hasUploadingAttachments = computed<boolean>(() =>
  currentAttachments.value.some(
    (attachment) => attachment.uploadStatus === ChatComposerAttachmentUploadStatus.Uploading,
  ),
)

const currentLinkPreview = computed<ChatMessageLinkPreview | null>(() => {
  const key = activeDraftKey.value
  if (!key) return null
  return draftPreviewByChannel.value[key] ?? null
})

const currentLinkPreviewLoading = computed<boolean>(() => {
  const key = activeDraftKey.value
  if (!key) return false
  return draftPreviewLoadingByChannel.value[key] === true
})

const currentLinkPreviewError = computed<string>(() => {
  const key = activeDraftKey.value
  if (!key) return ''
  return draftPreviewErrorByChannel.value[key] ?? ''
})

const canSend = computed(() => {
  if (!app.activeChannelId) return false
  if (isSending.value) return false
  if (hasUploadingAttachments.value) return false
  return message.value.trim().length > 0 || currentAttachments.value.length > 0
})

const clearTypingInterval = () => {
  if (typingIntervalId.value) {
    clearInterval(typingIntervalId.value)
    typingIntervalId.value = null
  }
}

const clearPreviewTimer = () => {
  if (previewDebounceId) {
    clearTimeout(previewDebounceId)
    previewDebounceId = null
  }
}

const abortPreviewRequest = () => {
  if (previewAbort) {
    previewAbort.abort()
    previewAbort = null
  }
}

const stopTyping = async () => {
  clearTypingInterval()
  if (!isTyping.value || typingHubId.value === null || typingChannelId.value === null) return
  const hubId = typingHubId.value
  const channelId = typingChannelId.value
  isTyping.value = false
  typingHubId.value = null
  typingChannelId.value = null
  if (socket.state.value === SocketState.READY) {
    await socket.sendTypingStopped(hubId, channelId)
  }
}

const startTyping = async (hubId: string, channelId: string) => {
  if (isTyping.value) return
  if (socket.state.value !== SocketState.READY) return
  isTyping.value = true
  typingHubId.value = hubId
  typingChannelId.value = channelId
  await socket.sendTypingStarted(hubId, channelId)

  clearTypingInterval()
  typingIntervalId.value = setInterval(async () => {
    if (isTyping.value && typingHubId.value && typingChannelId.value && socket.state.value === SocketState.READY) {
      await socket.sendTypingStarted(typingHubId.value, typingChannelId.value)
    }
  }, TYPING_RESEND_INTERVAL_MS)
}

const onInputFocus = async () => {
  const hasContent = message.value.trim().length > 0
  const hubId = app.activeHubId
  const channelId = app.activeChannelId
  if (hasContent && hubId && channelId && !isTyping.value) {
    await startTyping(hubId, channelId)
  }
}

const onInputBlur = async () => {
  if (isTyping.value) {
    await stopTyping()
  }
}

const inferAttachmentKind = (mimeType: string): ChatAttachmentKind => {
  if (mimeType.startsWith('image/')) return ChatAttachmentKind.Image
  return ChatAttachmentKind.File
}

const buildAttachmentId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const revokePreviewUrl = (previewUrl: string) => {
  if (!previewUrl) return
  try {
    URL.revokeObjectURL(previewUrl)
  } catch {
    // noop
  }
}

const validateFile = (file: File): string | null => {
  if (!file) return 'Gecersiz dosya'
  if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.type)) {
    return `Desteklenmeyen dosya turu: ${file.type || 'unknown'}`
  }
  if (file.size <= 0) {
    return 'Bos dosya yuklenemez'
  }
  if (file.size > maxFileSizeBytes.value) {
    return `Dosya limiti asildi (max ${Math.floor(maxFileSizeBytes.value / (1024 * 1024))} MB)`
  }
  return null
}

const sanitizeFileName = (name: string): string => {
  const base = (name || 'file').split('/').pop()?.split('\\').pop() ?? 'file'
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  return safe || 'file'
}

const extractErrorMessage = (error: unknown, fallback: string): string => {
  if (!error || typeof error !== 'object') return fallback
  const maybeError = error as {
    data?: { statusMessage?: string; message?: string }
    statusMessage?: string
    message?: string
  }
  return maybeError.data?.statusMessage ||
    maybeError.data?.message ||
    maybeError.statusMessage ||
    maybeError.message ||
    fallback
}

const isDirectImageUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value)
    return DIRECT_IMAGE_URL_EXTENSION_REGEX.test(parsed.pathname)
  } catch {
    return false
  }
}

const setDraftAttachmentsForKey = (key: string, nextAttachments: ChatComposerAttachmentDraft[]) => {
  draftsAttachmentsByChannel.value = {
    ...draftsAttachmentsByChannel.value,
    [key]: nextAttachments,
  }
}

const patchAttachmentsForActiveKey = (nextAttachments: ChatComposerAttachmentDraft[]) => {
  const key = activeDraftKey.value
  if (!key) return
  setDraftAttachmentsForKey(key, nextAttachments)
}

const getDraftAttachmentById = (key: string, attachmentId: string): ChatComposerAttachmentDraft | null => {
  const current = draftsAttachmentsByChannel.value[key] ?? []
  return current.find((attachment) => attachment.id === attachmentId) ?? null
}

const patchDraftAttachmentById = (
  key: string,
  attachmentId: string,
  updater: (current: ChatComposerAttachmentDraft) => ChatComposerAttachmentDraft,
) => {
  const current = draftsAttachmentsByChannel.value[key] ?? []
  let changed = false
  const next = current.map((attachment) => {
    if (attachment.id !== attachmentId) return attachment
    changed = true
    return updater(attachment)
  })
  if (!changed) return
  setDraftAttachmentsForKey(key, next)
}

const addDraftFiles = (files: File[] | FileList) => {
  const key = activeDraftKey.value
  if (!key) {
    toast.show('Dosya eklemek icin once bir kanal sec', 'info')
    return
  }

  const normalized = Array.from(files ?? []).filter((file): file is File => file instanceof File)
  if (normalized.length === 0) return

  const current = draftsAttachmentsByChannel.value[key] ?? []
  const existingSet = new Set(current.map((item) => `${item.displayName}:${item.sizeBytes}:${item.file.lastModified}`))
  const next = [...current]

  for (const file of normalized) {
    if (next.length >= maxFilesPerMessage.value) {
      toast.show(`En fazla ${maxFilesPerMessage.value} dosya ekleyebilirsin`, 'info')
      break
    }

    const fileError = validateFile(file)
    if (fileError) {
      toast.show(fileError, 'info')
      continue
    }

    const displayName = sanitizeFileName(file.name)
    const dedupeKey = `${displayName}:${file.size}:${file.lastModified}`
    if (existingSet.has(dedupeKey)) continue
    existingSet.add(dedupeKey)

    const mimeType = file.type || 'application/octet-stream'
    const kind = inferAttachmentKind(mimeType)
    const previewUrl = kind === ChatAttachmentKind.Image ? URL.createObjectURL(file) : ''

    next.push({
      id: buildAttachmentId(),
      kind,
      file,
      mimeType,
      displayName,
      sizeBytes: file.size,
      previewUrl,
      uploadStatus: ChatComposerAttachmentUploadStatus.Draft,
      uploadErrorMessage: '',
      uploadedAttachment: null,
    })
  }

  patchAttachmentsForActiveKey(next)
}

const removeDraftAttachment = (attachmentId: string) => {
  const key = activeDraftKey.value
  if (!key) return
  const current = draftsAttachmentsByChannel.value[key] ?? []
  const removing = current.find((attachment) => attachment.id === attachmentId)
  if (!removing) return
  revokePreviewUrl(removing.previewUrl)
  setDraftAttachmentsForKey(key, current.filter((attachment) => attachment.id !== attachmentId))
}

const clearDraftAttachmentsForKey = (key: string | null) => {
  if (!key) return
  const current = draftsAttachmentsByChannel.value[key] ?? []
  for (const attachment of current) {
    revokePreviewUrl(attachment.previewUrl)
  }
  setDraftAttachmentsForKey(key, [])
}

const clearDraftPreviewForKey = (key: string | null) => {
  if (!key) return
  draftPreviewByChannel.value[key] = null
  draftPreviewUrlByChannel.value[key] = ''
  draftPreviewLoadingByChannel.value[key] = false
  draftPreviewErrorByChannel.value[key] = ''
}

const maybeRefreshLinkPreview = () => {
  const key = activeDraftKey.value
  if (!key) return

  const url = extractFirstHttpUrl(message.value)
  if (!url) {
    abortPreviewRequest()
    clearPreviewTimer()
    clearDraftPreviewForKey(key)
    return
  }

  if (draftPreviewUrlByChannel.value[key] === url && draftPreviewByChannel.value[key]) {
    draftPreviewErrorByChannel.value[key] = ''
    draftPreviewLoadingByChannel.value[key] = false
    return
  }

  clearPreviewTimer()
  abortPreviewRequest()
  draftPreviewLoadingByChannel.value[key] = true
  draftPreviewErrorByChannel.value[key] = ''

  previewDebounceId = setTimeout(async () => {
    const activeKeyAtRequest = activeDraftKey.value
    if (!activeKeyAtRequest || activeKeyAtRequest !== key) return

    const cached = previewCache.get(url)
    if (cached) {
      draftPreviewByChannel.value[key] = cached
      draftPreviewUrlByChannel.value[key] = url
      draftPreviewLoadingByChannel.value[key] = false
      return
    }

    if (isDirectImageUrl(url)) {
      const parsed = new URL(url)
      const directImagePreview: ChatMessageLinkPreview = {
        url,
        title: parsed.pathname.split('/').pop() ?? url,
        description: '',
        siteName: parsed.hostname,
        imageUrl: url,
      }
      previewCache.set(url, directImagePreview)
      draftPreviewByChannel.value[key] = directImagePreview
      draftPreviewUrlByChannel.value[key] = url
      draftPreviewLoadingByChannel.value[key] = false
      return
    }

    previewAbort = new AbortController()

    try {
      const response = await $fetch<{ preview?: {
        url?: string
        title?: string
        description?: string
        siteName?: string
        site_name?: string
        imageUrl?: string
        image_url?: string
      } | null }>('/api/chat/link-preview', {
        method: 'POST',
        body: {
          channelId: app.activeChannelId ?? '',
          url,
        },
        signal: previewAbort.signal,
      })

      const rawPreview = response.preview
      if (!rawPreview?.url) {
        draftPreviewByChannel.value[key] = null
        draftPreviewUrlByChannel.value[key] = url
        draftPreviewErrorByChannel.value[key] = LINK_PREVIEW_UNAVAILABLE_MESSAGE
        draftPreviewLoadingByChannel.value[key] = false
        return
      }

      const normalized: ChatMessageLinkPreview = {
        url: rawPreview.url,
        title: rawPreview.title ?? '',
        description: rawPreview.description ?? '',
        siteName: rawPreview.siteName ?? rawPreview.site_name ?? '',
        imageUrl: rawPreview.imageUrl ?? rawPreview.image_url ?? '',
      }

      previewCache.set(url, normalized)

      if (activeDraftKey.value !== key) return
      draftPreviewByChannel.value[key] = normalized
      draftPreviewUrlByChannel.value[key] = url
      draftPreviewErrorByChannel.value[key] = ''
    } catch (error) {
      if (activeDraftKey.value !== key) return
      if ((error as { name?: string })?.name === 'AbortError') return
      devWarn('[input-bar] link preview failed', error)
      draftPreviewByChannel.value[key] = null
      draftPreviewUrlByChannel.value[key] = url
      draftPreviewErrorByChannel.value[key] = LINK_PREVIEW_UNAVAILABLE_MESSAGE
    } finally {
      if (activeDraftKey.value === key) {
        draftPreviewLoadingByChannel.value[key] = false
      }
      previewAbort = null
    }
  }, LINK_PREVIEW_DEBOUNCE_MS)
}

const clearCurrentLinkPreview = () => {
  const key = activeDraftKey.value
  if (!key) return
  clearDraftPreviewForKey(key)
}

const onComposerPaste = (event: ClipboardEvent) => {
  const clipboardItems = Array.from(event.clipboardData?.items ?? [])
  const files = clipboardItems
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))

  if (files.length === 0) return
  event.preventDefault()
  addDraftFiles(files)
}

const onDropFiles = (files: FileList) => {
  addDraftFiles(files)
}

const onAttachClick = () => {
  if (!app.activeChannelId) {
    toast.show('Dosya eklemek icin once bir kanal sec', 'info')
    return
  }
  fileInputRef.value?.click()
}

const onFileInputChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const files = target.files
  if (files && files.length > 0) {
    addDraftFiles(files)
  }
  target.value = ''
}

async function uploadDraftAttachment(channelId: string, attachment: ChatComposerAttachmentDraft): Promise<ChatMessageAttachment> {
  const formData = new FormData()
  formData.append('channelId', channelId)
  formData.append('files', attachment.file, attachment.displayName)

  const response = await $fetch<{
    attachments: Array<{
      id: string
      kind: number
      storageBucket: string
      storageKey: string
      mimeType: string
      displayName: string
      sizeBytes: number
    }>
  }>('/api/chat/attachments/upload', {
    method: 'POST',
    body: formData,
  })

  const rawAttachment = response.attachments?.[0]
  if (!rawAttachment?.id || !rawAttachment.storageKey || !rawAttachment.storageBucket) {
    throw new Error('Attachment upload response is invalid')
  }

  const kind = rawAttachment.kind === ChatAttachmentKind.Image
    ? ChatAttachmentKind.Image
    : rawAttachment.kind === ChatAttachmentKind.File
      ? ChatAttachmentKind.File
      : ChatAttachmentKind.Unspecified

  return {
    id: rawAttachment.id,
    kind,
    storageBucket: rawAttachment.storageBucket,
    storageKey: rawAttachment.storageKey,
    mimeType: rawAttachment.mimeType ?? '',
    displayName: rawAttachment.displayName ?? '',
    sizeBytes: Number(rawAttachment.sizeBytes ?? 0),
  } satisfies ChatMessageAttachment
}

async function ensureDraftAttachmentUploaded(
  channelId: string,
  key: string,
  attachmentId: string,
): Promise<ChatMessageAttachment | null> {
  const existing = getDraftAttachmentById(key, attachmentId)
  if (!existing) return null
  if (existing.uploadStatus === ChatComposerAttachmentUploadStatus.Uploaded && existing.uploadedAttachment) {
    return existing.uploadedAttachment
  }
  if (existing.uploadStatus === ChatComposerAttachmentUploadStatus.Uploading) {
    return null
  }

  patchDraftAttachmentById(key, attachmentId, (current) => ({
    ...current,
    uploadStatus: ChatComposerAttachmentUploadStatus.Uploading,
    uploadErrorMessage: '',
  }))

  try {
    const uploaded = await uploadDraftAttachment(channelId, existing)
    patchDraftAttachmentById(key, attachmentId, (current) => ({
      ...current,
      uploadStatus: ChatComposerAttachmentUploadStatus.Uploaded,
      uploadErrorMessage: '',
      uploadedAttachment: uploaded,
    }))
    return uploaded
  } catch (error) {
    const errorMessage = extractErrorMessage(error, 'Dosya yuklenemedi')
    patchDraftAttachmentById(key, attachmentId, (current) => ({
      ...current,
      uploadStatus: ChatComposerAttachmentUploadStatus.Failed,
      uploadErrorMessage: errorMessage,
      uploadedAttachment: null,
    }))
    return null
  }
}

function removeUploadedAttachmentsFromDraft(key: string, attachmentIdsToRemove: Set<string>) {
  const current = draftsAttachmentsByChannel.value[key] ?? []
  const next: ChatComposerAttachmentDraft[] = []

  for (const attachment of current) {
    const shouldRemove =
      attachmentIdsToRemove.has(attachment.id) &&
      attachment.uploadStatus === ChatComposerAttachmentUploadStatus.Uploaded
    if (shouldRemove) {
      revokePreviewUrl(attachment.previewUrl)
      continue
    }
    next.push(attachment)
  }

  setDraftAttachmentsForKey(key, next)
}

async function onRetryAttachment(attachmentId: string) {
  const channelId = app.activeChannelId
  const key = activeDraftKey.value
  if (!channelId || !key) return

  const uploaded = await ensureDraftAttachmentUploaded(channelId, key, attachmentId)
  if (!uploaded) {
    const latest = getDraftAttachmentById(key, attachmentId)
    toast.show(latest?.uploadErrorMessage || 'Dosya yuklenemedi', 'error')
    return
  }
  toast.show('Dosya yuklendi', 'success')
}

async function onSend() {
  if (isSending.value) return
  if (hasUploadingAttachments.value) {
    toast.show('Dosya yukleme devam ediyor', 'info')
    return
  }

  const channelId = app.activeChannelId
  const hubId = app.activeHubId
  const key = activeDraftKey.value
  const content = message.value.trim()
  const draftAttachments = [...currentAttachments.value]

  if (!channelId || !hubId) {
    devWarn('Cannot send message: missing active channel/hub')
    return
  }
  if (!key) {
    devWarn('Cannot send message: missing draft key')
    return
  }
  if (!content && draftAttachments.length === 0) return

  try {
    isSending.value = true
    const uploadedAttachmentIds = new Set<string>()
    const attachmentsToSend: ChatMessageAttachment[] = []
    for (const attachment of draftAttachments) {
      const uploaded = await ensureDraftAttachmentUploaded(channelId, key, attachment.id)
      if (!uploaded) continue
      uploadedAttachmentIds.add(attachment.id)
      attachmentsToSend.push(uploaded)
    }

    if (!content && attachmentsToSend.length === 0) {
      toast.show('Mesaj gonderilemedi: tum dosya yuklemeleri basarisiz', 'error')
      return
    }

    const firstUrl = extractFirstHttpUrl(content)
    const linkPreview = firstUrl && currentLinkPreview.value && draftPreviewUrlByChannel.value[key ?? ''] === firstUrl
      ? currentLinkPreview.value
      : null

    await socket.sendChatMessage(channelId, {
      content,
      attachments: attachmentsToSend,
      linkPreview,
    })

    message.value = ''
    draftsByChannel.value[key] = ''
    removeUploadedAttachmentsFromDraft(key, uploadedAttachmentIds)
    clearDraftPreviewForKey(key)
    if (isTyping.value) {
      await stopTyping()
    }
  } catch (error) {
    devError('Failed to send message:', error)
    toast.show(extractErrorMessage(error, 'Mesaj gonderilemedi'), 'error')
  } finally {
    isSending.value = false
  }
}

watch(
  () => message.value,
  (next) => {
    if (suppressTyping.value) return

    const hasContent = next.trim().length > 0
    const hubId = app.activeHubId
    const channelId = app.activeChannelId

    const key = draftKey(hubId, channelId)
    if (key) {
      draftsByChannel.value[key] = next
    }

    maybeRefreshLinkPreview()

    if (!hubId || !channelId) {
      if (isTyping.value) void stopTyping()
      return
    }

    if (hasContent && !isTyping.value) {
      void startTyping(hubId, channelId)
      return
    }

    if (!hasContent && isTyping.value) {
      void stopTyping()
    }
  }
)

watch(
  [() => app.activeHubId, () => app.activeChannelId],
  ([nextHub, nextChannel], [prevHub, prevChannel]) => {
    const prevKey = draftKey(prevHub, prevChannel)
    if (prevKey) {
      draftsByChannel.value[prevKey] = message.value
    }

    if (!isTyping.value) return
    if (nextHub !== typingHubId.value || nextChannel !== typingChannelId.value) {
      void stopTyping()
    }
  }
)

watch(
  [() => app.activeHubId, () => app.activeChannelId],
  async ([nextHub, nextChannel]) => {
    const nextKey = draftKey(nextHub, nextChannel)
    suppressTyping.value = true
    message.value = nextKey ? draftsByChannel.value[nextKey] ?? '' : ''
    await nextTick()
    suppressTyping.value = false
    maybeRefreshLinkPreview()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  clearTypingInterval()
  clearPreviewTimer()
  abortPreviewRequest()

  for (const key of Object.keys(draftsAttachmentsByChannel.value)) {
    clearDraftAttachmentsForKey(key)
  }

  if (isTyping.value) void stopTyping()
})
</script>

<template>
  <div class="input-wrapper">
    <input
      ref="fileInputRef"
      class="input-file-picker"
      type="file"
      multiple
      :accept="fileAccept"
      @change="onFileInputChange"
    />

    <MessageComposerShell
      v-model="message"
      :placeholder="placeholder"
      :disabled="!app.activeChannelId"
      :is-sending="isSending"
      :can-send="canSend"
      :attachments="currentAttachments"
      :link-preview="currentLinkPreview"
      :link-preview-loading="currentLinkPreviewLoading"
      :link-preview-error="currentLinkPreviewError"
      @send="onSend"
      @attach="onAttachClick"
      @remove-attachment="removeDraftAttachment"
      @retry-attachment="onRetryAttachment"
      @clear-preview="clearCurrentLinkPreview"
      @focus="onInputFocus"
      @blur="onInputBlur"
      @paste="onComposerPaste"
      @drop-files="onDropFiles"
    />
  </div>
</template>

<style scoped>
.input-wrapper {
  height: 100%;
  display: flex;
  align-items: center;
  padding: 10px 20px;
}

.input-file-picker {
  display: none;
}

@media (max-width: 1023px) {
  .input-wrapper {
    padding: 8px 12px;
  }
}
</style>
