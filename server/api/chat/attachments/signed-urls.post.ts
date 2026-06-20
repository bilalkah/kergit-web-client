import { createError, defineEventHandler, readBody } from 'h3'
import { requireChatMembership } from '../../../utils/chatAccess'
import { getSupabaseAdminClient } from '../../../utils/supabaseAdmin'
import { logSafeServerFailure } from '../../../utils/safeServerDiagnostics'

type SignedUrlRequest = {
  channelId?: string
  storageKeys?: string[]
}

export default defineEventHandler(async (event) => {
  const body = await readBody<SignedUrlRequest>(event)
  const channelId = body.channelId?.trim() ?? ''
  const scope = await requireChatMembership(event, channelId)

  const storageKeys = (body.storageKeys ?? [])
    .map((key) => key.trim())
    .filter((key) => key.length > 0)

  if (storageKeys.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'storageKeys are required',
    })
  }
  if (storageKeys.length > 256) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Too many storage keys requested',
    })
  }

  const prefix = `${scope.hubId}/${scope.channelId}/`
  const outOfScope = storageKeys.find((key) => !key.startsWith(prefix))
  if (outOfScope) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Attachment key is outside channel scope',
    })
  }

  const config = useRuntimeConfig(event)
  const bucket = String(config.supabaseAttachmentsBucket || 'chat-attachments')
  const expiresIn = Math.max(Number(config.supabaseAttachmentSignTtlSec ?? 900), 60)

  const admin = getSupabaseAdminClient()
  const signedRes = await admin.storage.from(bucket).createSignedUrls(storageKeys, expiresIn)
  if (signedRes.error) {
    logSafeServerFailure('chat/attachments/signed-urls', { stage: 'create_signed_urls', bucket }, signedRes.error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Attachment signed URL generation failed',
    })
  }

  const urls = (signedRes.data ?? []).map((item) => ({
    path: item.path,
    signedUrl: item.signedUrl ?? '',
    error: item.error ?? null,
  }))

  return {
    channelId: scope.channelId,
    expiresInSec: expiresIn,
    urls,
  }
})
