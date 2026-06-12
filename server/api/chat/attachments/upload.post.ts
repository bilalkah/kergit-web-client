import { createError, defineEventHandler, readMultipartFormData } from 'h3'
import { requireChatMembership } from '../../../utils/chatAccess'
import { getSupabaseAdminClient } from '../../../utils/supabaseAdmin'

enum MessageAttachmentKind {
  Unspecified = 0,
  Image = 1,
  File = 2,
}

type UploadAttachmentResponse = {
  id: string
  kind: MessageAttachmentKind
  storageKey: string
  mimeType: string
  displayName: string
  sizeBytes: number
}

const DEFAULT_ALLOWED_MIME_TYPES = new Set([
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

function sanitizeFileName(input: string): string {
  const basename = input.split('/').pop()?.split('\\').pop() ?? 'file'
  const sanitized = basename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return sanitized || 'file'
}

function inferKind(mimeType: string): MessageAttachmentKind {
  if (mimeType.startsWith('image/')) return MessageAttachmentKind.Image
  return MessageAttachmentKind.File
}

export default defineEventHandler(async (event) => {
  const form = await readMultipartFormData(event)
  if (!form || form.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Multipart form data is required',
    })
  }

  const channelId = form.find((entry) => entry.name === 'channelId')?.data?.toString('utf8') ?? ''
  const scope = await requireChatMembership(event, channelId)

  const config = useRuntimeConfig(event)
  const bucket = String(config.supabaseAttachmentsBucket || 'chat-attachments')
  const maxFiles = Math.max(Number(config.chatAttachmentMaxFiles ?? 6), 1)
  const maxSizeBytes = Math.max(Number(config.chatAttachmentMaxSizeBytes ?? 15 * 1024 * 1024), 1)

  const files = form
    .filter((entry) => entry.name === 'files' && !!entry.filename && Buffer.isBuffer(entry.data))
    .map((entry) => ({
      filename: entry.filename ?? 'file',
      mimeType: entry.type ?? 'application/octet-stream',
      data: entry.data as Buffer,
    }))

  if (files.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'At least one file is required',
    })
  }

  if (files.length > maxFiles) {
    throw createError({
      statusCode: 400,
      statusMessage: `Too many files (max ${maxFiles})`,
    })
  }

  const admin = getSupabaseAdminClient()
  const uploaded: UploadAttachmentResponse[] = []

  for (const file of files) {
    const safeName = sanitizeFileName(file.filename)
    const mimeType = file.mimeType.trim().toLowerCase()
    if (!DEFAULT_ALLOWED_MIME_TYPES.has(mimeType)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Unsupported mime type: ${mimeType}`,
      })
    }
    if (file.data.length <= 0 || file.data.length > maxSizeBytes) {
      throw createError({
        statusCode: 413,
        statusMessage: `File size exceeds limit (${maxSizeBytes} bytes)`,
      })
    }

    const objectId = crypto.randomUUID()
    const storageKey = `${scope.hubId}/${scope.channelId}/${scope.userId}/draft/${objectId}-${safeName}`
    const uploadRes = await admin.storage
      .from(bucket)
      .upload(storageKey, file.data, {
        contentType: mimeType,
        upsert: false,
      })

    if (uploadRes.error) {
      throw createError({
        statusCode: 500,
        statusMessage: uploadRes.error.message,
      })
    }

    uploaded.push({
      id: objectId,
      kind: inferKind(mimeType),
      storageKey,
      mimeType,
      displayName: safeName,
      sizeBytes: file.data.length,
    })
  }

  return {
    channelId: scope.channelId,
    attachments: uploaded,
  }
})
