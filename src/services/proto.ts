import { sercom } from '@/src/generated/proto/proto.js'

export const ENVELOPE_VERSION = 1

const Envelope = sercom.protocol.Envelope
const EnvelopeType = sercom.protocol.Envelope.Type

const Ping = sercom.protocol.command.Ping
const Pong = sercom.protocol.event.Pong
const Ack = sercom.protocol.command.Ack

const AuthOk = sercom.protocol.event.AuthOk
const CommandError = sercom.protocol.event.CommandError
const CommandErrorCode = sercom.protocol.event.CommandErrorCode
const StateSync = sercom.protocol.event.StateSync
const StateDelta = sercom.protocol.event.StateDelta
const RtSignal = sercom.protocol.event.RtSignal
const VoiceTokenIssued = sercom.protocol.event.VoiceTokenIssued
const VoiceSelfStatus = sercom.protocol.event.VoiceSelfStatus
const VoiceSelfRevoked = sercom.protocol.event.VoiceSelfRevoked
const VoiceKeyUpdate = sercom.protocol.event.VoiceKeyUpdate

const Authenticate = sercom.protocol.command.Authenticate
const AuthType = sercom.protocol.command.AuthType
const AuthProvider = sercom.protocol.command.AuthProvider
const RequestStateSync = sercom.protocol.command.RequestStateSync

// protobufjs keeps full enum identifiers when proto enum values are prefixed.
const authTypeEnum = AuthType as unknown as Record<string, number>
const authProviderEnum = AuthProvider as unknown as Record<string, number>
const AUTH_TYPE_AUTH = authTypeEnum.AuthType_AUTH ?? 1
const AUTH_TYPE_REAUTH = authTypeEnum.AuthType_REAUTH ?? 2
const AUTH_PROVIDER_SUPABASE = authProviderEnum.AuthProvider_SUPABASE ?? 1

const TypingCommand = sercom.protocol.command.Typing
const SelectActiveChannel = sercom.protocol.command.SelectActiveChannel
const JoinVoiceChannelRequest = sercom.protocol.command.JoinVoiceChannelRequest
const KickVoiceParticipant = sercom.protocol.command.KickVoiceParticipant
const VoiceChannelActivity = sercom.protocol.command.VoiceChannelActivity
const SendMessage = sercom.protocol.command.SendMessage
const FetchMessagesBefore = sercom.protocol.command.FetchMessagesBefore
const CreateChannel = sercom.protocol.command.CreateChannel
const UpdateChannel = sercom.protocol.command.UpdateChannel
const RemoveChannel = sercom.protocol.command.RemoveChannel
const CreateHub = sercom.protocol.command.CreateHub
const JoinHub = sercom.protocol.command.JoinHub
const CreateHubJoinCode = sercom.protocol.command.CreateHubJoinCode
const ValidateHubInvite = sercom.protocol.command.ValidateHubInvite
const HubDomain = sercom.protocol.domain.Hub
const LeaveHub = sercom.protocol.command.LeaveHub
const RemoveHub = sercom.protocol.command.RemoveHub
const KickHubMember = sercom.protocol.command.KickHubMember
const UpdateHub = sercom.protocol.command.UpdateHub
const UpdateHubMemberRole = sercom.protocol.command.UpdateHubMemberRole
const UpdateUser = sercom.protocol.command.UpdateUser

const toObjectOptions = {
  longs: String,
  bytes: Uint8Array,
}

const toObjectNumberLongsOptions = {
  longs: Number,
  bytes: Uint8Array,
}

const channelRef = (hubId: string, channelId: string) => ({
  hub_id: hubId,
  channel_id: channelId,
})

type VoiceResumeRequest = {
  hub_id: string
  channel_id: string
  resume_id: string
}

type EncodedMessageAttachment = {
  id: string
  kind: number
  storage_bucket: string
  storage_key: string
  mime_type: string
  display_name: string
  size_bytes: number
}

type EncodedMessageLinkPreview = {
  url: string
  title?: string
  description?: string
  site_name?: string
  image_url?: string
}

export const protoService = {
  EnvelopeType,
  CommandErrorCode,

  decodeEnvelope(buf: Uint8Array) {
    // `longs: Number` is safe for `seq`: it is a per-connection counter that will not
    // approach 2^53 within a connection's lifetime.
    return Envelope.toObject(Envelope.decode(buf), { bytes: Uint8Array, longs: Number }) as {
      version: number
      type: number
      seq?: number
      payload?: Uint8Array
    }
  },

  encodeEnvelope(type: number, payload?: Uint8Array): Uint8Array {
    return Envelope.encode(
      Envelope.create({ version: ENVELOPE_VERSION, type, payload })
    ).finish()
  },

  encodePing(lastRecvSeq = 0): Uint8Array {
    return Ping.encode(Ping.create({ last_recv_seq: lastRecvSeq })).finish()
  },

  // Cumulative acknowledgement of the highest contiguous reliable `seq` received.
  encodeAck(ackSeq: number): Uint8Array {
    return Ack.encode(Ack.create({ ack_seq: ackSeq })).finish()
  },

  decodePong(buf: Uint8Array) {
    return Pong.decode(buf)
  },

  decodeAuthOk(buf?: Uint8Array) {
    if (!buf || buf.length === 0) return {} as Record<string, never>
    return AuthOk.toObject(AuthOk.decode(buf), toObjectOptions) as Record<string, never>
  },

  decodeCommandError(buf: Uint8Array) {
    return CommandError.toObject(
      CommandError.decode(buf),
      toObjectNumberLongsOptions
    ) as {
      command_type: number
      code: number
      message?: string
    }
  },

  decodeStateSync(buf: Uint8Array) {
    return StateSync.toObject(StateSync.decode(buf), toObjectOptions) as {
      self?: { id?: string; metadata?: { username?: string; avatar_seed?: string; display_name?: string } }
      hubs: Array<{
        hub?: { id?: string; name?: string; metadata?: { avatar_seed?: string } }
        members: Array<{ member?: { user_id?: string; role?: number; is_online?: boolean } }>
        users: Array<{ user?: { id?: string; metadata?: { username?: string; avatar_seed?: string; display_name?: string } } }>
        channels: Array<{
          channel?: { id?: string; type?: number; metadata?: { name?: string } }
          voice?: {
            started_at_unix?: string | number
            participants: Array<{ user_id?: string; muted?: boolean; deafened?: boolean }>
          }
        }>
        join_code?: string
      }>
    }
  },

  decodeStateDelta(buf: Uint8Array) {
    return StateDelta.toObject(StateDelta.decode(buf), toObjectOptions) as {
      hubs: Array<{
        hub_id?: string
        hub_ops: Array<{
          upsert?: { hub?: { id?: string; name?: string; metadata?: { avatar_seed?: string } } }
          remove?: Record<string, never>
          join_code_set?: { join_code?: string }
        }>
        member_ops: Array<{
          upsert?: { state?: { member?: { user_id?: string; role?: number; is_online?: boolean } } }
          remove?: { user_id?: string }
        }>
        user_ops: Array<{
          upsert?: { state?: { user?: { id?: string; metadata?: { username?: string; avatar_seed?: string; display_name?: string } } } }
          remove?: { user_id?: string }
        }>
        channels: Array<{
          channel_id?: string
          channel_ops: Array<{
            upsert?: { channel?: { id?: string; type?: number; metadata?: { name?: string } } }
            remove?: Record<string, never>
          }>
          message_ops: Array<{
            append?: {
              state?: {
                message?: {
                  id?: string
                  author_id?: string
                  content?: string
                  attachments?: Array<{
                    id?: string
                    kind?: number
                    storage_bucket?: string
                    storage_key?: string
                    mime_type?: string
                    display_name?: string
                    size_bytes?: string | number
                  }>
                  link_preview?: {
                    url?: string
                    title?: string
                    description?: string
                    site_name?: string
                    image_url?: string
                  }
                  message_seq?: string | number
                  created_at_unix_us?: string | number
                }
              }
            }
            remove?: { message_id?: string }
            batch?: {
              direction?: number
              exhausted_before?: boolean
              states?: Array<{
                message?: {
                  id?: string
                  author_id?: string
                  content?: string
                  attachments?: Array<{
                    id?: string
                    kind?: number
                    storage_bucket?: string
                    storage_key?: string
                    mime_type?: string
                    display_name?: string
                    size_bytes?: string | number
                  }>
                  link_preview?: {
                    url?: string
                    title?: string
                    description?: string
                    site_name?: string
                    image_url?: string
                  }
                  message_seq?: string | number
                  created_at_unix_us?: string | number
                }
              }>
            }
          }>
          voice_ops: Array<{
            snapshot?: {
              state?: {
                started_at_unix?: string | number
                participants: Array<{ user_id?: string; muted?: boolean; deafened?: boolean }>
              }
            }
            upsert?: { participant?: { user_id?: string; muted?: boolean; deafened?: boolean } }
            remove?: { user_id?: string }
          }>
        }>
      }>
    }
  },

  decodeRtSignal(buf: Uint8Array) {
    return RtSignal.toObject(RtSignal.decode(buf), toObjectOptions) as {
      presence?: { hub_id?: string; user_id?: string; is_online?: boolean }
      typing?: {
        channel?: { hub_id?: string; channel_id?: string }
        user_id?: string
        is_typing?: boolean
      }
    }
  },

  decodeVoiceTokenIssued(buf: Uint8Array) {
    return VoiceTokenIssued.toObject(VoiceTokenIssued.decode(buf), toObjectOptions) as {
      token: string
      livekit_url: string
      expires_in: string
      e2ee_key: string
      key_index?: number
      resume_id?: string
    }
  },

  decodeVoiceKeyUpdate(buf: Uint8Array) {
    return VoiceKeyUpdate.toObject(VoiceKeyUpdate.decode(buf), toObjectOptions) as {
      channel?: {
        hub_id?: string
        channel_id?: string
      }
      e2ee_key: string
      key_index?: number
    }
  },

  decodeVoiceSelfStatus(buf: Uint8Array) {
    return VoiceSelfStatus.toObject(
      VoiceSelfStatus.decode(buf),
      toObjectOptions
    ) as {
      connected: boolean
      is_owner: boolean
      channel?: {
        hub_id?: string
        channel_id?: string
      }
      resume_id?: string
    }
  },

  decodeVoiceSelfRevoked(buf: Uint8Array) {
    return VoiceSelfRevoked.toObject(
      VoiceSelfRevoked.decode(buf),
      toObjectOptions
    ) as Record<string, never>
  },

  encodeAuthRequest(token: string, voiceResume?: VoiceResumeRequest): Uint8Array {
    const payload: {
      type: number
      provider: number
      token: string
      voice_resume?: {
        channel: {
          hub_id: string
          channel_id: string
        }
        resume_id: string
      }
    } = {
      type: AUTH_TYPE_AUTH,
      provider: AUTH_PROVIDER_SUPABASE,
      token,
    }

    if (
      voiceResume &&
      voiceResume.hub_id &&
      voiceResume.channel_id &&
      voiceResume.resume_id
    ) {
      payload.voice_resume = {
        channel: channelRef(voiceResume.hub_id, voiceResume.channel_id),
        resume_id: voiceResume.resume_id,
      }
    }

    return Authenticate.encode(
      Authenticate.create(payload)
    ).finish()
  },

  encodeAuthReauthRequest(token: string): Uint8Array {
    return Authenticate.encode(
      Authenticate.create({
        type: AUTH_TYPE_REAUTH,
        provider: AUTH_PROVIDER_SUPABASE,
        token,
      })
    ).finish()
  },

  encodeRequestStateSync(hubIds: string[] = []): Uint8Array {
    return RequestStateSync.encode(RequestStateSync.create({ hub_ids: hubIds })).finish()
  },

  encodeTyping(hubId: string, channelId: string, isTyping: boolean): Uint8Array {
    return TypingCommand.encode(
      TypingCommand.create({
        channel: channelRef(hubId, channelId),
        is_typing: isTyping === true,
      })
    ).finish()
  },

  encodeSelectActiveChannel(
    hubId: string,
    channelId: string,
    latestLimit: number,
    knownLatestCursor?: { message_seq: number }
  ): Uint8Array {
    return SelectActiveChannel.encode(
      SelectActiveChannel.create({
        channel: channelRef(hubId, channelId),
        latest_limit: latestLimit,
        known_latest_cursor:
          knownLatestCursor && knownLatestCursor.message_seq > 0
            ? { message_seq: knownLatestCursor.message_seq }
            : undefined,
      })
    ).finish()
  },

  encodeJoinVoiceChannelRequest(
    hubId: string,
    channelId: string,
    opts: { prefer_muted?: boolean; prefer_deafened?: boolean }
  ): Uint8Array {
    return JoinVoiceChannelRequest.encode(
      JoinVoiceChannelRequest.create({
        channel: channelRef(hubId, channelId),
        prefer_muted: opts.prefer_muted === true,
        prefer_deafened: opts.prefer_deafened === true,
      })
    ).finish()
  },

  encodeVoiceChannelActivity(
    hubId: string,
    channelId: string,
    isMuted: boolean,
    isDeafened: boolean
  ): Uint8Array {
    return VoiceChannelActivity.encode(
      VoiceChannelActivity.create({
        channel: channelRef(hubId, channelId),
        is_muted: isMuted === true,
        is_deafened: isDeafened === true,
      })
    ).finish()
  },

  encodeKickVoiceParticipant(
    hubId: string,
    channelId: string,
    userId: string
  ): Uint8Array {
    return KickVoiceParticipant.encode(
      KickVoiceParticipant.create({
        channel: channelRef(hubId, channelId),
        user_id: userId,
      })
    ).finish()
  },

  encodeSendMessage(
    hubId: string,
    channelId: string,
    content: string,
    attachments: EncodedMessageAttachment[] = [],
    linkPreview?: EncodedMessageLinkPreview
  ): Uint8Array {
    return SendMessage.encode(
      SendMessage.create({
        channel: channelRef(hubId, channelId),
        content,
        attachments,
        link_preview: linkPreview
          ? {
              url: linkPreview.url,
              title: linkPreview.title,
              description: linkPreview.description,
              site_name: linkPreview.site_name,
              image_url: linkPreview.image_url,
            }
          : undefined,
      })
    ).finish()
  },

  encodeFetchMessagesBefore(
    hubId: string,
    channelId: string,
    beforeCursor: { message_seq: number },
    limit: number
  ): Uint8Array {
    return FetchMessagesBefore.encode(
      FetchMessagesBefore.create({
        channel: channelRef(hubId, channelId),
        before_cursor: {
          message_seq: beforeCursor.message_seq,
        },
        limit,
      })
    ).finish()
  },

  encodeCreateHub(name: string): Uint8Array {
    return CreateHub.encode(CreateHub.create({ name })).finish()
  },

  encodeJoinHub(joinCode: string): Uint8Array {
    return JoinHub.encode(JoinHub.create({ join_code: joinCode })).finish()
  },

  encodeCreateHubJoinCode(hubId: string): Uint8Array {
    return CreateHubJoinCode.encode(CreateHubJoinCode.create({ hub_id: hubId })).finish()
  },

  encodeValidateHubInvite(joinCode: string): Uint8Array {
    return ValidateHubInvite.encode(ValidateHubInvite.create({ join_code: joinCode })).finish()
  },

  decodeHubInvitePreview(buf: Uint8Array) {
    return HubDomain.toObject(HubDomain.decode(buf), toObjectOptions) as {
      id?: string
      name?: string
      metadata?: { avatar_seed?: string }
    }
  },

  encodeLeaveHub(hubId: string): Uint8Array {
    return LeaveHub.encode(LeaveHub.create({ hub_id: hubId })).finish()
  },

  encodeRemoveHub(hubId: string): Uint8Array {
    return RemoveHub.encode(RemoveHub.create({ hub_id: hubId })).finish()
  },

  encodeKickHubMember(hubId: string, userId: string): Uint8Array {
    return KickHubMember.encode(KickHubMember.create({ hub_id: hubId, user_id: userId })).finish()
  },

  encodeUpdateHub(hubId: string, opts: { name?: string; avatar_seed?: string }): Uint8Array {
    return UpdateHub.encode(
      UpdateHub.create({
        hub_id: hubId,
        name: opts.name,
        avatar_seed: opts.avatar_seed,
      })
    ).finish()
  },

  encodeUpdateHubMemberRole(hubId: string, userId: string, role: number): Uint8Array {
    return UpdateHubMemberRole.encode(
      UpdateHubMemberRole.create({
        hub_id: hubId,
        user_id: userId,
        role,
      })
    ).finish()
  },

  encodeCreateChannel(hubId: string, name: string, type: number): Uint8Array {
    return CreateChannel.encode(CreateChannel.create({ hub_id: hubId, name, type })).finish()
  },

  encodeUpdateChannel(
    hubId: string,
    channelId: string,
    opts: { name?: string }
  ): Uint8Array {
    return UpdateChannel.encode(
      UpdateChannel.create({
        channel: channelRef(hubId, channelId),
        name: opts.name,
      })
    ).finish()
  },

  encodeRemoveChannel(hubId: string, channelId: string): Uint8Array {
    return RemoveChannel.encode(
      RemoveChannel.create({
        channel: channelRef(hubId, channelId),
      })
    ).finish()
  },

  encodeUpdateUser(opts: { username?: string; avatar_seed?: string; display_name?: string }): Uint8Array {
    return UpdateUser.encode(
      UpdateUser.create({
        username: opts.username,
        avatar_seed: opts.avatar_seed,
        display_name: opts.display_name,
      })
    ).finish()
  },
}
