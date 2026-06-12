import { createError, type H3Event } from 'h3'
import { requireSupabaseSessionFromCookies } from './authSession'
import { getSupabaseAdminClient } from './supabaseAdmin'

export type ChatScope = {
  userId: string
  hubId: string
  channelId: string
}

function normalizeUuid(value: string | undefined | null): string {
  const normalized = (value ?? '').trim()
  return normalized
}

export async function requireChatMembership(event: H3Event, channelIdInput: string): Promise<ChatScope> {
  const session = await requireSupabaseSessionFromCookies(event)
  const userId = normalizeUuid(session.user.id)
  const channelId = normalizeUuid(channelIdInput)

  if (!userId || !channelId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'user_id and channel_id are required',
    })
  }

  const admin = getSupabaseAdminClient()
  const channelRes = await admin
    .from('channels')
    .select('id, hub_id')
    .eq('id', channelId)
    .maybeSingle()

  if (channelRes.error) {
    throw createError({
      statusCode: 500,
      statusMessage: channelRes.error.message,
    })
  }

  if (!channelRes.data?.hub_id) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Channel not found',
    })
  }

  const hubId = normalizeUuid(channelRes.data.hub_id)
  const membershipRes = await admin
    .from('hub_members')
    .select('hub_id')
    .eq('hub_id', hubId)
    .eq('user_id', userId)
    .maybeSingle()

  if (membershipRes.error) {
    throw createError({
      statusCode: 500,
      statusMessage: membershipRes.error.message,
    })
  }

  if (!membershipRes.data) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Not a member of this channel hub',
    })
  }

  return {
    userId,
    hubId,
    channelId,
  }
}

