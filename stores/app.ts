// stores/app.ts
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
    DEFAULT_PARTICIPANT_VOLUME_PERCENT,
    normalizeInputSensitivityThreshold,
    normalizeParticipantVolumePercent,
    readStoredParticipantVolume,
    writeStoredParticipantVolume,
} from '@/src/services/webrtc/utils'
import {
    InputSensitivityMode,
    NoiseCancellationMethod,
} from '@/src/services/webrtc/inputHandler'
import {
    disableCamera,
    disableScreenShare,
    enableCamera,
    enableScreenShare,
    setRemoteVideoSubscribed,
    setScreenShareAudioMuted,
} from '@/src/services/webrtc/livekit'
import { devLog, devWarn } from '@/src/utils/safeLogger'
import { canUseLocalStorage } from '@/src/utils/storage'
import { useToast } from '~/composables/useToast'
import {
    ChatAttachmentKind,
    type ChatMessageAttachment,
    type ChatMessageLinkPreview,
} from '@/src/features/messages/types'

function showErrorToast(message: string): void {
    useToast().show(message, 'error')
}

/* =======================
 * Types
 * ======================= */

export enum HubRole {
    Member = 'member',
    Owner = 'owner',
    Admin = 'admin',
}

export enum ChannelType {
    Text = 'text',
    Voice = 'voice',
}

export enum FetchStatus {
    Pending = 'pending',
    Done = 'done',
}

export enum VoiceConnectionState {
    Idle = 'idle',
    Connecting = 'connecting',
    Connected = 'connected',
    Error = 'error',
}

export interface Hub { id: string; name: string; role: HubRole; channels_count: number; avatar_seed?: string }

export interface Channel { id: string; name: string; type: ChannelType }

export interface Member { user_id: string; role: HubRole; is_online: boolean }

export interface UserInfo { id: string; username: string; avatar_seed: string }

export interface ChatMessage {
    id: string
    channel_id: string
    author_id: string
    content: string
    attachments: ChatMessageAttachment[]
    link_preview: ChatMessageLinkPreview | null
    created_at_ms: number
    created_at_unix_us: number
    author?: { id: string; username?: string; avatar_seed?: string }
}

export interface VoiceProcessingSettings {
    noiseSuppression: boolean
    echoCancellation: boolean
    noiseCancellationMethod: NoiseCancellationMethod
    inputSensitivityMode: InputSensitivityMode
    inputSensitivityThreshold: number
}

export enum VideoMode {
    Performance = 'performance',
    Quality = 'quality',
}

export interface RtSignalPatch {
    presence_changed?: { hub_id: string; user_id: string; is_online: boolean }
    typing?: { hub_id: string; channel_id: string; user_id: string; is_typing: boolean }
}

export interface MessageAppendPatch {
    channel_id: string
    message: {
        id: string
        author_id: string
        content: string
        attachments?: Array<{
            id?: string
            kind?: number
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
        created_at_unix_us: string | number
        author?: { id: string; metadata?: { username?: string; avatar_seed?: string } }
    }
}

export interface MessageBatchPatch {
    channel_id: string
    direction: number
    messages: Array<{
        id: string
        author_id: string
        content: string
        attachments?: Array<{
            id?: string
            kind?: number
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
        created_at_unix_us: string | number
        author?: { id: string; metadata?: { username?: string; avatar_seed?: string } }
    }>
}

export interface MessageCursor {
    message_id: string
    created_at_unix_us: number
}

export interface HubMemberUpsertPatch {
    member?: {
        hub_id: string
        user_id: string
        is_online: boolean
        role: number
    }
    user?: { id: string; metadata?: { username?: string; avatar_seed?: string } }
}

export interface HubMemberRemovePatch {
    hub_id: string
    user_id: string
}

export interface VoiceSnapshotPatch {
    channel?: {
        hub_id?: string
        channel_id?: string
    }
    hub_id?: string
    channel_id?: string
    started_at_unix?: string | number
    participants: Array<{
        user_id: string
        muted: boolean
        deafened: boolean
    }>
}

export interface VoiceSelfStatusEvent {
    connected: boolean
    is_owner: boolean
    hub_id?: string
    channel_id: string
}

interface StateSyncPayload {
    self?: { id?: string; metadata?: { username?: string; avatar_seed?: string } }
    hubs?: Array<{
        hub?: { id?: string; name?: string; metadata?: { avatar_seed?: string } }
        members?: Array<{ member?: { user_id?: string; role?: number; is_online?: boolean } }>
        users?: Array<{ user?: { id?: string; metadata?: { username?: string; avatar_seed?: string } } }>
        channels?: Array<{
            channel?: { id?: string; type?: number; metadata?: { name?: string } }
            voice?: {
                started_at_unix?: string | number
                participants?: Array<{ user_id?: string; muted?: boolean; deafened?: boolean }>
            }
        }>
        join_code?: string
    }>
}

interface StateDeltaPayload {
    hubs?: Array<{
        hub_id?: string
        hub_ops?: Array<{
            upsert?: { hub?: { id?: string; name?: string; metadata?: { avatar_seed?: string } } }
            remove?: Record<string, never>
            join_code_set?: { join_code?: string }
        }>
        member_ops?: Array<{
            upsert?: { state?: { member?: { user_id?: string; role?: number; is_online?: boolean } } }
            remove?: { user_id?: string }
        }>
        user_ops?: Array<{
            upsert?: { state?: { user?: { id?: string; metadata?: { username?: string; avatar_seed?: string } } } }
            remove?: { user_id?: string }
        }>
        channels?: Array<{
            channel_id?: string
            channel_ops?: Array<{
                upsert?: { channel?: { id?: string; type?: number; metadata?: { name?: string } } }
                remove?: Record<string, never>
            }>
            message_ops?: Array<{
                append?: {
                    state?: {
                        message?: {
                            id?: string
                            author_id?: string
                            content?: string
                            attachments?: Array<{
                                id?: string
                                kind?: number
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
                            created_at_unix_us?: string | number
                        }
                    }>
                }
            }>
            voice_ops?: Array<{
                snapshot?: {
                    state?: {
                        started_at_unix?: string | number
                        participants?: Array<{ user_id?: string; muted?: boolean; deafened?: boolean }>
                    }
                }
                upsert?: { participant?: { user_id?: string; muted?: boolean; deafened?: boolean } }
                remove?: { user_id?: string }
            }>
        }>
    }>
}

interface RtSignalPayload {
    presence?: { hub_id?: string; user_id?: string; is_online?: boolean }
    typing?: {
        channel?: { hub_id?: string; channel_id?: string }
        user_id?: string
        is_typing?: boolean
    }
}

export interface VoiceParticipantActivityPatch {
    channel?: {
        hub_id?: string
        channel_id?: string
    }
    hub_id?: string
    channel_id?: string
    participant?: {
        user_id?: string
        muted?: boolean
        deafened?: boolean
    }
    user_id?: string
    muted?: boolean
    deafened?: boolean
    activity: number
}

export interface VoiceParticipantStatePatch {
    participant?: {
        user_id?: string
        muted?: boolean
        deafened?: boolean
    }
    user_id?: string
    muted?: boolean
    deafened?: boolean
}

export interface PendingVoiceTakeover {
    hubId: string
    channelId: string
    reason: 'switch' | 'takeover'
}

interface VoiceParticipantStateModel {
    muted: boolean
    deafened: boolean
}

interface VoiceChannelStateModel {
    hubId: string
    channelId: string
    startedAtUnix: number
    participantsByUser: Record<string, VoiceParticipantStateModel>
}

interface SignedAttachmentUrlEntry {
    signedUrl: string
    expiresAtMs: number
}

interface AttachmentImagePreviewCacheEntry {
    objectUrl: string
    byteSize: number
    lastAccessAt: number
}

interface SignedAttachmentUrlsResponse {
    expiresInSec: number
    urls: Array<{
        path: string
        signedUrl: string
        error?: string | null
    }>
}

export interface HubJoinCodeSetPatch {
    hub_id: string
    join_code: string
}

export interface HubPatch {
    hub_id: string
    action: number
    hub?: { id: string; name?: string; metadata?: { avatar_seed?: string } }
}

export interface ChannelPatch {
    hub_id: string
    action: number
    channel?: { id: string; hub_id?: string; type?: number; metadata?: { name?: string } }
}

type ByHub<T> = Record<string, T[]>

const MAX_MESSAGES_PER_CHANNEL = 400
const MAX_MEMBERS_PER_HUB = 500
const MAX_TYPING_USERS_PER_CHANNEL = 32
const MAX_VOICE_PARTICIPANTS_PER_CHANNEL = 64
const SIGNED_URL_SAFETY_BUFFER_MS = 60_000
const ATTACHMENT_PREVIEW_CACHE_MAX_ENTRIES = 100
const ATTACHMENT_PREVIEW_CACHE_MAX_TOTAL_BYTES = 64 * 1024 * 1024
const VOICE_NOISE_SUPPRESSION_STORAGE_KEY = 'voice_noise_suppression'
const VOICE_ECHO_CANCELLATION_STORAGE_KEY = 'voice_echo_cancellation'
const VOICE_INPUT_SENSITIVITY_MODE_STORAGE_KEY = 'voice_input_sensitivity_mode'
const VOICE_INPUT_SENSITIVITY_THRESHOLD_STORAGE_KEY = 'voice_input_sensitivity_threshold'
const VOICE_NOISE_CANCELLATION_METHOD_STORAGE_KEY = 'voice_noise_cancellation_method'
const VOICE_MUTED_STORAGE_KEY = 'voice_pref_muted'
const VOICE_DEAFENED_STORAGE_KEY = 'voice_pref_deafened'
const VIDEO_MODE_STORAGE_KEY = 'video_mode'
const DEFAULT_VOICE_PROCESSING_SETTINGS: VoiceProcessingSettings = {
    noiseSuppression: true,
    echoCancellation: true,
    noiseCancellationMethod: NoiseCancellationMethod.WebRTC,
    inputSensitivityMode: InputSensitivityMode.Auto,
    inputSensitivityThreshold: 42,
}
const DEFAULT_VIDEO_MODE: VideoMode = VideoMode.Performance
type VoiceProcessingToggleKey = 'noiseSuppression' | 'echoCancellation'

const VOICE_PROCESSING_STORAGE_KEYS: Record<VoiceProcessingToggleKey, string> = {
    noiseSuppression: VOICE_NOISE_SUPPRESSION_STORAGE_KEY,
    echoCancellation: VOICE_ECHO_CANCELLATION_STORAGE_KEY,
}

type MessageRetention = 'keep-latest' | 'keep-oldest'

function readVoicePreference(key: string, fallback: boolean): boolean {
    if (!canUseLocalStorage()) return fallback
    try {
        const raw = window.localStorage.getItem(key)
        if (raw === null) return fallback
        return raw === 'true'
    } catch {
        return fallback
    }
}

function writeVoicePreference(key: string, value: boolean) {
    if (!canUseLocalStorage()) return
    try {
        window.localStorage.setItem(key, String(value))
    } catch {
        // Ignore storage failures (private mode, quota, etc.)
    }
}

function readVideoModePreference(): VideoMode {
    if (!canUseLocalStorage()) return DEFAULT_VIDEO_MODE
    try {
        const raw = window.localStorage.getItem(VIDEO_MODE_STORAGE_KEY)
        return raw === VideoMode.Quality ? VideoMode.Quality : VideoMode.Performance
    } catch {
        return DEFAULT_VIDEO_MODE
    }
}

function writeVideoModePreference(mode: VideoMode) {
    if (!canUseLocalStorage()) return
    try {
        window.localStorage.setItem(VIDEO_MODE_STORAGE_KEY, mode)
    } catch {
        // Ignore storage failures.
    }
}

function readVoiceInputSensitivityMode(): InputSensitivityMode {
    if (!canUseLocalStorage()) return DEFAULT_VOICE_PROCESSING_SETTINGS.inputSensitivityMode
    try {
        const raw = window.localStorage.getItem(VOICE_INPUT_SENSITIVITY_MODE_STORAGE_KEY)
        if (raw === InputSensitivityMode.Manual) return InputSensitivityMode.Manual
        return InputSensitivityMode.Auto
    } catch {
        return DEFAULT_VOICE_PROCESSING_SETTINGS.inputSensitivityMode
    }
}

function writeVoiceInputSensitivityMode(mode: InputSensitivityMode) {
    if (!canUseLocalStorage()) return
    try {
        const value = mode === InputSensitivityMode.Manual
            ? InputSensitivityMode.Manual
            : InputSensitivityMode.Auto
        window.localStorage.setItem(VOICE_INPUT_SENSITIVITY_MODE_STORAGE_KEY, value)
    } catch {
        // Ignore storage failures.
    }
}

function readVoiceInputSensitivityThreshold(): number {
    if (!canUseLocalStorage()) return DEFAULT_VOICE_PROCESSING_SETTINGS.inputSensitivityThreshold
    try {
        const raw = window.localStorage.getItem(VOICE_INPUT_SENSITIVITY_THRESHOLD_STORAGE_KEY)
        const parsed = Number.parseInt(raw ?? '', 10)
        return normalizeInputSensitivityThreshold(parsed)
    } catch {
        return DEFAULT_VOICE_PROCESSING_SETTINGS.inputSensitivityThreshold
    }
}

function writeVoiceInputSensitivityThreshold(value: number) {
    if (!canUseLocalStorage()) return
    try {
        window.localStorage.setItem(
            VOICE_INPUT_SENSITIVITY_THRESHOLD_STORAGE_KEY,
            String(normalizeInputSensitivityThreshold(value))
        )
    } catch {
        // Ignore storage failures.
    }
}

function readVoiceMutedPreference(): boolean {
    return readVoicePreference(VOICE_MUTED_STORAGE_KEY, false)
}

function writeVoiceMutedPreference(value: boolean) {
    writeVoicePreference(VOICE_MUTED_STORAGE_KEY, value)
}

function readVoiceDeafenedPreference(): boolean {
    return readVoicePreference(VOICE_DEAFENED_STORAGE_KEY, false)
}

function writeVoiceDeafenedPreference(value: boolean) {
    writeVoicePreference(VOICE_DEAFENED_STORAGE_KEY, value)
}

function readNoiseCancellationMethod(): NoiseCancellationMethod {
    if (!canUseLocalStorage()) return DEFAULT_VOICE_PROCESSING_SETTINGS.noiseCancellationMethod
    try {
        const raw = window.localStorage.getItem(VOICE_NOISE_CANCELLATION_METHOD_STORAGE_KEY)
        if (raw === NoiseCancellationMethod.Krisp) return NoiseCancellationMethod.Krisp
        return NoiseCancellationMethod.WebRTC
    } catch {
        return DEFAULT_VOICE_PROCESSING_SETTINGS.noiseCancellationMethod
    }
}

function writeNoiseCancellationMethod(method: NoiseCancellationMethod) {
    if (!canUseLocalStorage()) return
    try {
        window.localStorage.setItem(VOICE_NOISE_CANCELLATION_METHOD_STORAGE_KEY, method)
    } catch {
        // Ignore storage failures.
    }
}

function readVoiceProcessingSettings(): VoiceProcessingSettings {
    return {
        noiseSuppression: readVoicePreference(VOICE_NOISE_SUPPRESSION_STORAGE_KEY, true),
        echoCancellation: readVoicePreference(VOICE_ECHO_CANCELLATION_STORAGE_KEY, true),
        noiseCancellationMethod: readNoiseCancellationMethod(),
        inputSensitivityMode: readVoiceInputSensitivityMode(),
        inputSensitivityThreshold: readVoiceInputSensitivityThreshold(),
    }
}

function writeVoiceProcessingSetting(key: VoiceProcessingToggleKey, value: boolean) {
    writeVoicePreference(VOICE_PROCESSING_STORAGE_KEYS[key], value)
}

/* =======================
 * Store
 * ======================= */

export const useAppStore = defineStore('app', () => {
    // ===== server state =====
    const hubs = ref<Hub[]>([])
    const channelsByHub = ref<ByHub<Channel>>({})
    const membersByHub = ref<ByHub<Member>>({})
    const usersLookup = ref<Record<string, Record<string, UserInfo>>>({})

    // global presence (single source of truth)
    const presenceByUser = ref<Record<string, boolean>>({})
    const typingByChannel = ref<Record<string, string[]>>({})
    // Map of channelId:userId -> timeout handle for auto-expiring typing indicators
    const typingTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
    const voiceChannelsByKey = ref<Record<string, VoiceChannelStateModel>>({})
    const userVoiceChannelById = ref<Record<string, string>>({})
    const pendingVoiceStateByUser = ref<Record<string, VoiceParticipantStateModel>>({})
    const voiceParticipantsByChannel = ref<Record<string, string[]>>({})
    const voiceStartedAtUnixByChannel = ref<Record<string, number>>({})
    const voiceStatesByUser = ref<Record<string, { muted: boolean; deafened: boolean }>>({})
    const speakingUsersById = ref<Record<string, boolean>>({})
    const messagesByChannel = ref<Record<string, ChatMessage[]>>({})
    const historyExhaustedByChannel = ref<Record<string, boolean>>({})
    const channelInitialFetchById = ref<Record<string, FetchStatus>>({})
    const hubJoinCodes = ref<Record<string, string>>({})
    const commandErrors = ref<Record<number, { code: number; message: string }>>({})
    const lastHubEventAt = ref<number | null>(null)
    const lastChannelCreated = ref<{ hubId: string; channelId: string } | null>(null)

    const messageIdsByChannel = new Map<string, Set<string>>()
    const signedAttachmentUrlsByChannel = ref<Record<string, Record<string, SignedAttachmentUrlEntry>>>({})
    const signedAttachmentFailuresByChannel = ref<Record<string, Record<string, string>>>({})
    const signedAttachmentUrlResolveInFlight = new Map<string, Promise<string>>()
    const attachmentImagePreviewCache = new Map<string, AttachmentImagePreviewCacheEntry>()
    let attachmentImagePreviewCacheTotalBytes = 0

    // ===== identity =====
    const userId = ref<string | null>(null)
    const username = ref<string | null>(null)
    const displayName = ref<string | null>(null)
    const avatarSeed = ref<string | null>(null)

    // ===== UI selections =====
    const activeHubId = ref<string | null>(null)
    const activeChannelId = ref<string | null>(null)
    const activeVoiceChannelId = ref<string | null>(null)
    const activeVoiceHubId = ref<string | null>(null)
    const voiceMuted = ref(readVoiceMutedPreference())
    const voiceDeafened = ref(readVoiceDeafenedPreference())
    const voiceProcessingSettings = ref<VoiceProcessingSettings>(readVoiceProcessingSettings())
    const userVolumeOverrides = ref<Record<string, number>>({})
    const voiceLatencyMs = ref<number | null>(null)
    const voiceConnecting = ref(false)
    const voiceError = ref<string | null>(null)
    const voiceOwnershipConnected = ref(false)
    const voiceOwnershipIsOwner = ref(false)
    const voiceConnectedByThisSession = ref(false)
    const voiceConnectedElsewhere = ref(false)
    const pendingVoiceTakeover = ref<PendingVoiceTakeover | null>(null)
    const viewedHubId = ref<string | null>(null)
    const viewingVoiceGrid = ref(false)
    const localCameraEnabled = ref(false)
    const localScreenShareEnabled = ref(false)
    const screenShareAudioMuted = ref(false)
    const videoMode = ref<VideoMode>(readVideoModePreference())
    const voiceNeedsAudioUnlock = ref(false)

    // Desktop + mobile panel state
    const desktopMembersOpen = ref(true)
    const mobilePanels = ref({ channelsOpen: false, membersOpen: false, voiceOpen: false })

    if (import.meta.client) {
        queueMicrotask(() => {
            voiceProcessingSettings.value = readVoiceProcessingSettings()
        })
    }

    function toggleDesktopMembersPanel() {
        desktopMembersOpen.value = !desktopMembersOpen.value
    }

    function openChannelsPanel() {
        mobilePanels.value.channelsOpen = true
        mobilePanels.value.membersOpen = false
    }

    function toggleChannelsPanel() {
        if (mobilePanels.value.channelsOpen) {
            mobilePanels.value.channelsOpen = false
            return
        }
        openChannelsPanel()
    }

    function openMembersPanel() {
        mobilePanels.value.membersOpen = true
        mobilePanels.value.channelsOpen = false
    }

    function toggleMembersPanel() {
        if (mobilePanels.value.membersOpen) {
            mobilePanels.value.membersOpen = false
            return
        }
        openMembersPanel()
    }

    function openVoicePanel() {
        mobilePanels.value.voiceOpen = true
    }

    function toggleVoicePanel() {
        mobilePanels.value.voiceOpen = !mobilePanels.value.voiceOpen
    }

    function closeMobilePanels() {
        mobilePanels.value.channelsOpen = false
        mobilePanels.value.membersOpen = false
    }

    // ===== derived =====
    const activeHub = computed<Hub | null>(() => {
        if (!activeHubId.value) return null
        return hubs.value.find(h => h.id === activeHubId.value) ?? null
    })

    const viewedHub = computed<Hub | null>(() => {
        if (!viewedHubId.value) return null
        return hubs.value.find(h => h.id === viewedHubId.value) ?? null
    })

    const viewedChannels = computed<Channel[]>(() => {
        if (!viewedHubId.value) return []
        return channelsByHub.value[viewedHubId.value] ?? []
    })

    const viewedMembers = computed<Member[]>(() => {
        if (!viewedHubId.value) return []
        return membersByHub.value[viewedHubId.value] ?? []
    })

    function getUserInfo(hubId: string | null | undefined, targetUserId: string | null | undefined): UserInfo | null {
        if (!hubId || !targetUserId) return null
        return usersLookup.value[hubId]?.[targetUserId] ?? null
    }

    function getUserDisplayName(hubId: string | null | undefined, targetUserId: string | null | undefined): string {
        if (!targetUserId) return 'Kullanıcı'

        const userInfo = getUserInfo(hubId, targetUserId)
        const username = userInfo?.username?.trim()
        if (username) return username

        if (!hubId) return 'Kullanıcı'
        const isCurrentMember = (membersByHub.value[hubId] ?? [])
            .some(member => member.user_id === targetUserId)

        if (!isCurrentMember) {
            return 'Bilinmeyen kullanıcı'
        }

        return 'Kullanıcı'
    }

    const hasLocalActiveVoice = computed(() =>
        Boolean(activeVoiceChannelId.value && activeVoiceHubId.value && !voiceConnectedElsewhere.value)
    )

    const voiceConnectionState = computed<VoiceConnectionState>(() => {
        if (voiceError.value) return VoiceConnectionState.Error
        if (voiceConnecting.value) return VoiceConnectionState.Connecting
        if (voiceConnectedByThisSession.value) return VoiceConnectionState.Connected
        return VoiceConnectionState.Idle
    })

    const activeChannel = computed<Channel | null>(() => {
        if (!activeHubId.value || !activeChannelId.value) return null
        const list = channelsByHub.value[activeHubId.value] ?? []
        return list.find(c => c.id === activeChannelId.value) ?? null
    })

    const isActiveTextChannel = (hubId: string | null, channelId: string | null): boolean => {
        if (!hubId || !channelId) return false
        const list = channelsByHub.value[hubId] ?? []
        return list.some(c => c.id === channelId && c.type === ChannelType.Text)
    }

    const firstTextChannelId = (hubId: string | null): string | null => {
        if (!hubId) return null
        const list = channelsByHub.value[hubId] ?? []
        return list.find(c => c.type === ChannelType.Text)?.id ?? null
    }

    // ===== helpers =====
    function isUserOnline(userId: string): boolean {
        return presenceByUser.value[userId] === true
    }

    const normalizeId = (value: string | undefined | null): string => {
        if (value === null || value === undefined) return ''
        return value
    }

    const parseCreatedAtUnixUs = (value: string | number | undefined | null): number => {
        if (value === null || value === undefined) return 0
        const num = typeof value === 'number' ? value : Number(value)
        if (!Number.isFinite(num)) return 0
        return Math.max(0, Math.floor(num))
    }

    const parseAttachmentKind = (kind: number | undefined): ChatAttachmentKind => {
        switch (kind) {
            case ChatAttachmentKind.Image:
                return ChatAttachmentKind.Image
            case ChatAttachmentKind.File:
                return ChatAttachmentKind.File
            default:
                return ChatAttachmentKind.Unspecified
        }
    }

    const normalizeAttachments = (attachments: Array<{
        id?: string
        kind?: number
        storage_key?: string
        mime_type?: string
        display_name?: string
        size_bytes?: string | number
    }> | undefined): ChatMessageAttachment[] => {
        if (!attachments || attachments.length === 0) return []
        return attachments
            .map((attachment) => {
                const id = normalizeId(attachment.id)
                const storageKey = normalizeId(attachment.storage_key)
                if (!id || !storageKey) return null
                const sizeRaw = attachment.size_bytes
                const sizeParsed = typeof sizeRaw === 'number' ? sizeRaw : Number(sizeRaw ?? 0)
                return {
                    id,
                    kind: parseAttachmentKind(attachment.kind),
                    storageKey,
                    mimeType: normalizeId(attachment.mime_type),
                    displayName: normalizeId(attachment.display_name),
                    sizeBytes: Number.isFinite(sizeParsed) && sizeParsed > 0
                        ? Math.floor(sizeParsed)
                        : 0,
                } satisfies ChatMessageAttachment
            })
            .filter((attachment): attachment is ChatMessageAttachment => attachment !== null)
    }

    const normalizeLinkPreview = (linkPreview: {
        url?: string
        title?: string
        description?: string
        site_name?: string
        image_url?: string
    } | undefined): ChatMessageLinkPreview | null => {
        if (!linkPreview) return null
        const url = normalizeId(linkPreview.url)
        if (!url) return null
        return {
            url,
            title: normalizeId(linkPreview.title),
            description: normalizeId(linkPreview.description),
            siteName: normalizeId(linkPreview.site_name),
            imageUrl: normalizeId(linkPreview.image_url),
        }
    }

    const getMessageSet = (channelId: string): Set<string> => {
        const existing = messageIdsByChannel.get(channelId)
        if (existing) return existing
        const created = new Set<string>()
        messageIdsByChannel.set(channelId, created)
        return created
    }

    const attachmentCacheKey = (channelId: string, storageKey: string): string =>
        `${channelId}:${storageKey}`

    const revokeObjectUrl = (objectUrl: string) => {
        if (!objectUrl || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return
        URL.revokeObjectURL(objectUrl)
    }

    const isSignedUrlUsable = (entry?: SignedAttachmentUrlEntry): entry is SignedAttachmentUrlEntry =>
        Boolean(entry?.signedUrl) && (entry?.expiresAtMs ?? 0) > Date.now() + SIGNED_URL_SAFETY_BUFFER_MS

    const getSignedAttachmentEntries = (channelId: string): Record<string, SignedAttachmentUrlEntry> =>
        signedAttachmentUrlsByChannel.value[channelId] ?? {}

    const setSignedAttachmentFailures = (channelId: string, failures: Record<string, string>) => {
        signedAttachmentFailuresByChannel.value = {
            ...signedAttachmentFailuresByChannel.value,
            [channelId]: failures,
        }
    }

    const clearSignedAttachmentFailure = (channelId: string, storageKey: string) => {
        const existing = signedAttachmentFailuresByChannel.value[channelId]
        if (!existing?.[storageKey]) return
        const next = { ...existing }
        delete next[storageKey]
        setSignedAttachmentFailures(channelId, next)
    }

    const removeAttachmentImagePreviewCacheEntry = (cacheKey: string) => {
        const entry = attachmentImagePreviewCache.get(cacheKey)
        if (!entry) return
        attachmentImagePreviewCache.delete(cacheKey)
        attachmentImagePreviewCacheTotalBytes = Math.max(
            0,
            attachmentImagePreviewCacheTotalBytes - Math.max(entry.byteSize, 0)
        )
        revokeObjectUrl(entry.objectUrl)
    }

    const pruneAttachmentImagePreviewCache = () => {
        if (
            attachmentImagePreviewCache.size <= ATTACHMENT_PREVIEW_CACHE_MAX_ENTRIES &&
            attachmentImagePreviewCacheTotalBytes <= ATTACHMENT_PREVIEW_CACHE_MAX_TOTAL_BYTES
        ) {
            return
        }

        const sortedEntries = Array.from(attachmentImagePreviewCache.entries())
            .sort(([, left], [, right]) => left.lastAccessAt - right.lastAccessAt)

        for (const [cacheKey] of sortedEntries) {
            if (
                attachmentImagePreviewCache.size <= ATTACHMENT_PREVIEW_CACHE_MAX_ENTRIES &&
                attachmentImagePreviewCacheTotalBytes <= ATTACHMENT_PREVIEW_CACHE_MAX_TOTAL_BYTES
            ) {
                break
            }
            removeAttachmentImagePreviewCacheEntry(cacheKey)
        }
    }

    const clearAttachmentCachesForChannel = (channelIdInput: string | null | undefined) => {
        const channelId = normalizeId(channelIdInput).trim()
        if (!channelId) return

        if (signedAttachmentUrlsByChannel.value[channelId]) {
            const next = { ...signedAttachmentUrlsByChannel.value }
            delete next[channelId]
            signedAttachmentUrlsByChannel.value = next
        }

        if (signedAttachmentFailuresByChannel.value[channelId]) {
            const next = { ...signedAttachmentFailuresByChannel.value }
            delete next[channelId]
            signedAttachmentFailuresByChannel.value = next
        }

        for (const cacheKey of Array.from(attachmentImagePreviewCache.keys())) {
            if (cacheKey.startsWith(`${channelId}:`)) {
                removeAttachmentImagePreviewCacheEntry(cacheKey)
            }
        }
    }

    const clearAllAttachmentCaches = () => {
        signedAttachmentUrlsByChannel.value = {}
        signedAttachmentFailuresByChannel.value = {}
        signedAttachmentUrlResolveInFlight.clear()
        for (const cacheKey of Array.from(attachmentImagePreviewCache.keys())) {
            removeAttachmentImagePreviewCacheEntry(cacheKey)
        }
    }

    const getCachedSignedAttachmentUrl = (
        channelIdInput: string | null | undefined,
        storageKeyInput: string | null | undefined,
    ): string => {
        const channelId = normalizeId(channelIdInput).trim()
        const storageKey = normalizeId(storageKeyInput).trim()
        if (!channelId || !storageKey) return ''
        const entry = getSignedAttachmentEntries(channelId)[storageKey]
        if (!isSignedUrlUsable(entry)) return ''
        return entry.signedUrl
    }

    const hasCachedAttachmentPreviewObjectUrl = (
        channelIdInput: string | null | undefined,
        storageKeyInput: string | null | undefined,
    ): boolean => {
        const channelId = normalizeId(channelIdInput).trim()
        const storageKey = normalizeId(storageKeyInput).trim()
        if (!channelId || !storageKey) return false
        return attachmentImagePreviewCache.has(attachmentCacheKey(channelId, storageKey))
    }

    const getCachedAttachmentPreviewObjectUrl = (
        channelIdInput: string | null | undefined,
        storageKeyInput: string | null | undefined,
    ): string => {
        const channelId = normalizeId(channelIdInput).trim()
        const storageKey = normalizeId(storageKeyInput).trim()
        if (!channelId || !storageKey) return ''

        const cacheKey = attachmentCacheKey(channelId, storageKey)
        const entry = attachmentImagePreviewCache.get(cacheKey)
        if (!entry?.objectUrl) return ''

        entry.lastAccessAt = Date.now()
        return entry.objectUrl
    }

    const cacheAttachmentPreviewObjectUrl = (
        channelIdInput: string | null | undefined,
        storageKeyInput: string | null | undefined,
        objectUrl: string,
        byteSize: number,
    ): string => {
        const channelId = normalizeId(channelIdInput).trim()
        const storageKey = normalizeId(storageKeyInput).trim()
        if (!channelId || !storageKey || !objectUrl) return ''

        const cacheKey = attachmentCacheKey(channelId, storageKey)
        const now = Date.now()
        const normalizedByteSize = Number.isFinite(byteSize) && byteSize > 0
            ? Math.floor(byteSize)
            : 0
        const existing = attachmentImagePreviewCache.get(cacheKey)

        if (existing && existing.objectUrl !== objectUrl) {
            attachmentImagePreviewCacheTotalBytes = Math.max(
                0,
                attachmentImagePreviewCacheTotalBytes - Math.max(existing.byteSize, 0)
            )
            revokeObjectUrl(existing.objectUrl)
        } else if (existing) {
            attachmentImagePreviewCacheTotalBytes = Math.max(
                0,
                attachmentImagePreviewCacheTotalBytes - Math.max(existing.byteSize, 0)
            )
        }

        attachmentImagePreviewCache.set(cacheKey, {
            objectUrl,
            byteSize: normalizedByteSize,
            lastAccessAt: now,
        })
        attachmentImagePreviewCacheTotalBytes += normalizedByteSize
        pruneAttachmentImagePreviewCache()
        return attachmentImagePreviewCache.get(cacheKey)?.objectUrl ?? ''
    }

    const removeCachedAttachmentPreviewObjectUrl = (
        channelIdInput: string | null | undefined,
        storageKeyInput: string | null | undefined,
    ) => {
        const channelId = normalizeId(channelIdInput).trim()
        const storageKey = normalizeId(storageKeyInput).trim()
        if (!channelId || !storageKey) return
        removeAttachmentImagePreviewCacheEntry(attachmentCacheKey(channelId, storageKey))
    }

    const fetchSignedAttachmentUrls = async (channelId: string, storageKeys: string[]) => {
        if (!channelId || storageKeys.length === 0) return

        try {
            const response = await $fetch<SignedAttachmentUrlsResponse>('/api/chat/attachments/signed-urls', {
                method: 'POST',
                body: {
                    channelId,
                    storageKeys,
                },
            })
            const expiresInSec = Math.max(Number(response.expiresInSec || 300), 60)
            const expiresAtMs = Date.now() + expiresInSec * 1000
            const nextMap: Record<string, SignedAttachmentUrlEntry> = {
                ...(signedAttachmentUrlsByChannel.value[channelId] ?? {}),
            }
            const nextFailures: Record<string, string> = {
                ...(signedAttachmentFailuresByChannel.value[channelId] ?? {}),
            }

            for (const item of response.urls ?? []) {
                if (!item.path) continue
                if (item.error) {
                    nextFailures[item.path] = item.error
                    continue
                }
                if (!item.signedUrl) continue
                nextMap[item.path] = {
                    signedUrl: item.signedUrl,
                    expiresAtMs,
                }
                delete nextFailures[item.path]
            }

            signedAttachmentUrlsByChannel.value = {
                ...signedAttachmentUrlsByChannel.value,
                [channelId]: nextMap,
            }
            setSignedAttachmentFailures(channelId, nextFailures)
        } catch (error) {
            devWarn('[attachments] failed to resolve attachment signed URLs', error)
        }
    }

    const ensureSignedAttachmentUrls = async (
        channelIdInput: string | null | undefined,
        storageKeysInput: string[],
    ) => {
        const channelId = normalizeId(channelIdInput).trim()
        if (!channelId) return

        const uniqueStorageKeys = Array.from(
            new Set(
                storageKeysInput
                    .map((storageKey) => normalizeId(storageKey).trim())
                    .filter((storageKey) => storageKey.length > 0)
            )
        )
        if (uniqueStorageKeys.length === 0) return

        const signedEntries = getSignedAttachmentEntries(channelId)
        const storageKeysToRefresh = uniqueStorageKeys.filter((storageKey) => {
            const cachedSignedUrl = signedEntries[storageKey]
            return !isSignedUrlUsable(cachedSignedUrl)
        })
        if (storageKeysToRefresh.length === 0) return

        await fetchSignedAttachmentUrls(channelId, storageKeysToRefresh)
    }

    const resolveAttachmentSignedUrl = async (
        channelIdInput: string | null | undefined,
        storageKeyInput: string | null | undefined,
        forceRefresh = false,
    ): Promise<string> => {
        const channelId = normalizeId(channelIdInput).trim()
        const storageKey = normalizeId(storageKeyInput).trim()
        if (!channelId || !storageKey) return ''

        if (!forceRefresh) {
            const cachedUrl = getCachedSignedAttachmentUrl(channelId, storageKey)
            if (cachedUrl) return cachedUrl
        }

        const dedupeKey = attachmentCacheKey(channelId, storageKey)
        const pending = signedAttachmentUrlResolveInFlight.get(dedupeKey)
        if (pending) return pending

        const request = (async () => {
            await fetchSignedAttachmentUrls(channelId, [storageKey])
            const resolved = getCachedSignedAttachmentUrl(channelId, storageKey)
            if (!resolved) {
                const failure = signedAttachmentFailuresByChannel.value[channelId]?.[storageKey]
                if (failure) {
                    devWarn('[attachments] attachment signed URL unavailable', {
                        channelId,
                        storageKey,
                        error: failure,
                    })
                }
            } else {
                clearSignedAttachmentFailure(channelId, storageKey)
            }
            return resolved
        })()

        signedAttachmentUrlResolveInFlight.set(dedupeKey, request)
        try {
            return await request
        } finally {
            signedAttachmentUrlResolveInFlight.delete(dedupeKey)
        }
    }

    const normalizeMessage = (
        channelId: string,
        raw: {
            id: string
            author_id: string
            content: string
            attachments?: Array<{
                id?: string
                kind?: number
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
            created_at_unix_us: string | number
            author?: { id: string; metadata?: { username?: string; avatar_seed?: string } }
        }
    ): ChatMessage => {
        const createdAtUnixUs = parseCreatedAtUnixUs(raw.created_at_unix_us)
        const createdAtMs = createdAtUnixUs > 0 ? Math.floor(createdAtUnixUs / 1000) : 0
        return {
            id: normalizeId(raw.id),
            channel_id: normalizeId(channelId),
            author_id: normalizeId(raw.author_id),
            content: raw.content ?? '',
            attachments: normalizeAttachments(raw.attachments),
            link_preview: normalizeLinkPreview(raw.link_preview),
            created_at_ms: createdAtMs,
            created_at_unix_us: createdAtUnixUs,
            ...(raw.author ? {
                author: {
                    id: raw.author.id,
                    username: raw.author.metadata?.username,
                    avatar_seed: raw.author.metadata?.avatar_seed,
                },
            } : {}),
        }
    }

    const findHubIdByChannelId = (channelId: string | null | undefined): string | null => {
        const normalizedChannelId = normalizeId(channelId)
        if (!normalizedChannelId) return null
        for (const [hubId, channels] of Object.entries(channelsByHub.value)) {
            if ((channels ?? []).some(channel => channel.id === normalizedChannelId)) {
                return hubId
            }
        }
        return null
    }

    const voiceChannelKey = (hubId: string, channelId: string): string =>
        `${hubId}:${channelId}`

    const parseVoiceChannelKey = (
        key: string | null | undefined
    ): { hubId: string; channelId: string } | null => {
        const raw = normalizeId(key)
        if (!raw) return null
        const sep = raw.indexOf(':')
        if (sep <= 0 || sep >= raw.length - 1) return null
        return {
            hubId: raw.slice(0, sep),
            channelId: raw.slice(sep + 1),
        }
    }

    const parseUnixSeconds = (value: string | number | undefined | null): number => {
        if (value === undefined || value === null) return 0
        const parsed = typeof value === 'number' ? value : Number(value)
        if (!Number.isFinite(parsed)) return 0
        return Math.max(0, Math.floor(parsed))
    }

    const parseVoiceChannelRef = (
        source:
            | VoiceSnapshotPatch
            | VoiceParticipantActivityPatch
            | { channel?: { hub_id?: string; channel_id?: string }; hub_id?: string; channel_id?: string },
        origin: string
    ): { hubId: string; channelId: string } | null => {
        const hubId = normalizeId(source.channel?.hub_id ?? source.hub_id ?? '')
        const channelId = normalizeId(source.channel?.channel_id ?? source.channel_id ?? '')
        if (!hubId || !channelId) {
            devWarn(`[voice] ${origin} ignored: missing hub/channel`, source)
            return null
        }
        return { hubId, channelId }
    }

    type StateSyncHubPayload = NonNullable<StateSyncPayload['hubs']>[number]

    const roleFromProto = (role?: number): HubRole => {
        switch (role) {
            case 2:
                return HubRole.Owner
            case 3:
                return HubRole.Admin
            case 1:
            default:
                return HubRole.Member
        }
    }

    const normalizeStateSyncChannels = (hubId: string, state: StateSyncHubPayload): Array<{ id: string; hub_id?: string; type: number; metadata?: { name?: string } }> =>
        (state.channels ?? [])
            .map(channelState => channelState.channel)
            .filter((channel): channel is { id?: string; type?: number; metadata?: { name?: string } } => Boolean(channel?.id))
            .map(channel => ({
                id: normalizeId(channel.id),
                hub_id: hubId,
                type: channel.type ?? 0,
                metadata: {
                    name: channel.metadata?.name ?? '',
                },
            }))

    const normalizeStateSyncMembers = (hubId: string, state: StateSyncHubPayload): Array<{ hub_id: string; user_id: string; role: number; is_online: boolean }> =>
        (state.members ?? [])
            .map(memberState => memberState.member)
            .filter((member): member is { user_id?: string; role?: number; is_online?: boolean } => Boolean(member?.user_id))
            .map(member => ({
                hub_id: hubId,
                user_id: normalizeId(member.user_id),
                role: member.role ?? 0,
                is_online: member.is_online === true,
            }))

    const extractVoiceSnapshotsFromStateSync = (
        hubsPayload: StateSyncHubPayload[]
    ): VoiceSnapshotPatch[] => {
        const snapshots: VoiceSnapshotPatch[] = []
        for (const hubState of hubsPayload) {
            const hubId = normalizeId(hubState.hub?.id)
            if (!hubId) continue
            for (const channelState of hubState.channels ?? []) {
                const channelId = normalizeId(channelState.channel?.id)
                if (!channelId || !channelState.voice) continue
                snapshots.push({
                    channel: {
                        hub_id: hubId,
                        channel_id: channelId,
                    },
                    started_at_unix: channelState.voice.started_at_unix ?? 0,
                    participants: (channelState.voice.participants ?? []).map(participant => ({
                        user_id: participant.user_id ?? '',
                        muted: participant.muted === true,
                        deafened: participant.deafened === true,
                    })),
                })
            }
        }
        return snapshots
    }

    const normalizeVoiceParticipantState = (
        raw: { muted?: boolean; deafened?: boolean } | undefined
    ): VoiceParticipantStateModel => ({
        muted: raw?.muted === true,
        deafened: raw?.deafened === true,
    })

    const rebuildVoiceDerivedState = () => {
        const nextParticipantsByChannel: Record<string, string[]> = {}
        const nextStatesByUser: Record<string, VoiceParticipantStateModel> = {}
        const nextStartedAtByChannel: Record<string, number> = {}
        const nextUserVoiceChannelById: Record<string, string> = {}

        for (const [key, channel] of Object.entries(voiceChannelsByKey.value)) {
            const participants = channel.participantsByUser ?? {}
            const participantIds = Object.keys(participants)
            if (participantIds.length > 0) {
                nextParticipantsByChannel[channel.channelId] = participantIds
            }
            nextStartedAtByChannel[channel.channelId] =
                participantIds.length > 0 ? channel.startedAtUnix : 0

            for (const participantId of participantIds) {
                nextStatesByUser[participantId] = {
                    muted: participants[participantId]?.muted === true,
                    deafened: participants[participantId]?.deafened === true,
                }
                nextUserVoiceChannelById[participantId] = key
            }
        }

        const nextSpeakingUsers: Record<string, boolean> = {}
        for (const speakerId of Object.keys(speakingUsersById.value)) {
            if (nextStatesByUser[speakerId]) {
                nextSpeakingUsers[speakerId] = true
            }
        }

        voiceParticipantsByChannel.value = nextParticipantsByChannel
        voiceStatesByUser.value = nextStatesByUser
        voiceStartedAtUnixByChannel.value = nextStartedAtByChannel
        userVoiceChannelById.value = nextUserVoiceChannelById
        speakingUsersById.value = nextSpeakingUsers
    }

    const setVoiceChannelState = (
        hubId: string,
        channelId: string,
        nextState: VoiceChannelStateModel
    ) => {
        const key = voiceChannelKey(hubId, channelId)
        voiceChannelsByKey.value = {
            ...voiceChannelsByKey.value,
            [key]: nextState,
        }
    }

    const removeVoiceChannelState = (hubId: string, channelId: string) => {
        const key = voiceChannelKey(hubId, channelId)
        if (!voiceChannelsByKey.value[key]) return
        const next = { ...voiceChannelsByKey.value }
        delete next[key]
        voiceChannelsByKey.value = next
    }

    const applyPendingVoiceState = (
        participantId: string,
        fallbackState: VoiceParticipantStateModel
    ): VoiceParticipantStateModel => {
        const pending = pendingVoiceStateByUser.value[participantId]
        if (!pending) return fallbackState

        const nextPending = { ...pendingVoiceStateByUser.value }
        delete nextPending[participantId]
        pendingVoiceStateByUser.value = nextPending
        return pending
    }

    const removeVoiceParticipantFromAllChannels = (participantIdInput: string) => {
        const participantId = normalizeId(participantIdInput)
        if (!participantId) return

        const nextVoiceChannels = { ...voiceChannelsByKey.value }
        let changed = false

        for (const [key, channelState] of Object.entries(nextVoiceChannels)) {
            if (!(participantId in channelState.participantsByUser)) continue
            const participantsByUser = { ...channelState.participantsByUser }
            delete participantsByUser[participantId]
            nextVoiceChannels[key] = {
                ...channelState,
                participantsByUser,
                startedAtUnix:
                    Object.keys(participantsByUser).length === 0 ? 0 : channelState.startedAtUnix,
            }
            changed = true
        }

        if (!changed) return

        if (pendingVoiceStateByUser.value[participantId]) {
            const nextPending = { ...pendingVoiceStateByUser.value }
            delete nextPending[participantId]
            pendingVoiceStateByUser.value = nextPending
        }

        voiceChannelsByKey.value = nextVoiceChannels
        rebuildVoiceDerivedState()
    }

    const removeSelfFromAllVoiceChannels = () => {
        const selfId = normalizeId(userId.value)
        if (!selfId) return
        removeVoiceParticipantFromAllChannels(selfId)
    }

    const purgeVoiceStateForHub = (hubIdInput: string | null | undefined) => {
        const hubId = normalizeId(hubIdInput)
        if (!hubId) return

        const nextVoiceChannels: Record<string, VoiceChannelStateModel> = {}
        const removedUserIds = new Set<string>()
        let changed = false

        for (const [key, channelState] of Object.entries(voiceChannelsByKey.value)) {
            if (channelState.hubId !== hubId) {
                nextVoiceChannels[key] = channelState
                continue
            }
            changed = true
            for (const participantId of Object.keys(channelState.participantsByUser ?? {})) {
                removedUserIds.add(participantId)
            }
        }

        if (!changed) return

        voiceChannelsByKey.value = nextVoiceChannels
        if (removedUserIds.size > 0) {
            const nextPending = { ...pendingVoiceStateByUser.value }
            for (const removedUserId of removedUserIds) {
                delete nextPending[removedUserId]
            }
            pendingVoiceStateByUser.value = nextPending
        }
        rebuildVoiceDerivedState()
        syncOwnVoiceChannelFromMembership()

        if (activeVoiceHubId.value === hubId) {
            clearActiveVoiceChannel()
        } else {
            recomputeVoiceOwnershipFlags()
        }
    }

    const ensureVoiceParticipantInChannel = (
        hubIdInput: string,
        channelIdInput: string,
        participantIdInput: string,
        fallbackState: VoiceParticipantStateModel
    ) => {
        const hubId = normalizeId(hubIdInput)
        const channelId = normalizeId(channelIdInput)
        const participantId = normalizeId(participantIdInput)
        if (!hubId || !channelId || !participantId) return

        const targetKey = voiceChannelKey(hubId, channelId)
        const nextVoiceChannels = { ...voiceChannelsByKey.value }
        const currentKey = userVoiceChannelById.value[participantId]

        if (currentKey && currentKey !== targetKey && nextVoiceChannels[currentKey]) {
            const currentState = nextVoiceChannels[currentKey]
            const currentParticipants = { ...currentState.participantsByUser }
            delete currentParticipants[participantId]
            nextVoiceChannels[currentKey] = {
                ...currentState,
                participantsByUser: currentParticipants,
                startedAtUnix:
                    Object.keys(currentParticipants).length === 0 ? 0 : currentState.startedAtUnix,
            }
        }

        const channelState = nextVoiceChannels[targetKey] ?? {
            hubId,
            channelId,
            startedAtUnix: 0,
            participantsByUser: {},
        }
        const participantsByUser = { ...channelState.participantsByUser }
        participantsByUser[participantId] = applyPendingVoiceState(participantId, fallbackState)

        nextVoiceChannels[targetKey] = {
            ...channelState,
            participantsByUser,
        }

        voiceChannelsByKey.value = nextVoiceChannels
        rebuildVoiceDerivedState()
    }

    const syncOwnVoiceChannelFromMembership = () => {
        if (!voiceOwnershipConnected.value) return
        const selfId = normalizeId(userId.value)
        if (!selfId) return
        const key = userVoiceChannelById.value[selfId]
        const parsed = parseVoiceChannelKey(key)
        if (!parsed) return
        activeVoiceChannelId.value = parsed.channelId
        activeVoiceHubId.value = parsed.hubId
    }

    const takeLastUniqueBy = <T>(
        values: T[],
        keyFor: (value: T) => string,
        limit: number
    ): T[] => {
        const seen = new Set<string>()
        const next: T[] = []

        for (let i = values.length - 1; i >= 0; i -= 1) {
            const value = values[i]
            if (!value) continue
            const key = normalizeId(keyFor(value))
            if (!key || seen.has(key)) continue
            seen.add(key)
            next.push(value)
            if (next.length >= limit) break
        }

        return next.reverse()
    }

    const setMembersForHub = (hubId: string, members: Member[]) => {
        let next = takeLastUniqueBy(members, member => member.user_id, MAX_MEMBERS_PER_HUB)
        const selfMemberId = normalizeId(userId.value)
        if (selfMemberId && !next.some(member => member.user_id === selfMemberId)) {
            const selfMember = members.find(member => member.user_id === selfMemberId)
            if (selfMember) {
                next =
                    next.length >= MAX_MEMBERS_PER_HUB
                        ? [...next.slice(1), selfMember]
                        : [...next, selfMember]
            }
        }
        membersByHub.value[hubId] = next
    }

    const setTypingUsersForChannel = (channelId: string, userIds: string[]) => {
        const current = typingByChannel.value[channelId] ?? []
        const next = takeLastUniqueBy(userIds, id => id, MAX_TYPING_USERS_PER_CHANNEL)
        const removed = current.filter(id => !next.includes(id))

        for (const removedUserId of removed) {
            const timeoutKey = `${channelId}:${removedUserId}`
            const timeout = typingTimeouts.get(timeoutKey)
            if (!timeout) continue
            clearTimeout(timeout)
            typingTimeouts.delete(timeoutKey)
        }

        typingByChannel.value[channelId] = next
    }

    const trimMessageWindow = (channelId: string, retention: MessageRetention) => {
        const current = messagesByChannel.value[channelId] ?? []
        const overflow = current.length - MAX_MESSAGES_PER_CHANNEL
        if (overflow <= 0) return

        const removed =
            retention === 'keep-oldest'
                ? current.slice(MAX_MESSAGES_PER_CHANNEL)
                : current.slice(0, overflow)
        const next =
            retention === 'keep-oldest'
                ? current.slice(0, MAX_MESSAGES_PER_CHANNEL)
                : current.slice(overflow)

        const ids = getMessageSet(channelId)
        for (const msg of removed) {
            if (!msg.id) continue
            ids.delete(msg.id)
        }

        messagesByChannel.value[channelId] = next
    }

    const applyVoiceSnapshot = (
        snapshot: VoiceSnapshotPatch,
        authoritative = true
    ) => {
        const ref = parseVoiceChannelRef(snapshot, 'voice_snapshot')
        if (!ref) return

        const participantsInput = snapshot.participants ?? []
        const normalizedParticipants: Array<{ user_id: string; muted: boolean; deafened: boolean }> = []
        for (const participant of participantsInput) {
            const participantId = normalizeId(participant.user_id)
            if (!participantId) {
                devWarn('[voice] voice_snapshot participant ignored: missing user_id', {
                    snapshot,
                    participant,
                })
                continue
            }
            normalizedParticipants.push({
                user_id: participantId,
                muted: participant.muted === true,
                deafened: participant.deafened === true,
            })
        }

        const limitedParticipants = takeLastUniqueBy(
            normalizedParticipants,
            participant => participant.user_id,
            MAX_VOICE_PARTICIPANTS_PER_CHANNEL
        )

        const participantsByUser: Record<string, VoiceParticipantStateModel> = {}
        for (const participant of limitedParticipants) {
            participantsByUser[participant.user_id] = applyPendingVoiceState(participant.user_id, {
                muted: participant.muted,
                deafened: participant.deafened,
            })
        }

        const key = voiceChannelKey(ref.hubId, ref.channelId)
        const nextVoiceChannels = { ...voiceChannelsByKey.value }

        for (const participantId of Object.keys(participantsByUser)) {
            const previousKey = userVoiceChannelById.value[participantId]
            if (!previousKey || previousKey === key) continue
            const previousState = nextVoiceChannels[previousKey]
            if (!previousState) continue
            const previousParticipants = { ...previousState.participantsByUser }
            delete previousParticipants[participantId]
            nextVoiceChannels[previousKey] = {
                ...previousState,
                participantsByUser: previousParticipants,
                startedAtUnix: Object.keys(previousParticipants).length === 0 ? 0 : previousState.startedAtUnix,
            }
        }

        nextVoiceChannels[key] = {
            hubId: ref.hubId,
            channelId: ref.channelId,
            startedAtUnix:
                Object.keys(participantsByUser).length > 0
                    ? parseUnixSeconds(snapshot.started_at_unix)
                    : 0,
            participantsByUser,
        }

        voiceChannelsByKey.value = nextVoiceChannels
        rebuildVoiceDerivedState()

        syncRuntimeVoiceSelectionFromSelfState()

        if (authoritative) {
            recomputeVoiceOwnershipFlags()
        }
        syncOwnVoiceChannelFromMembership()
    }

    const upsertMessages = (
        channelId: string,
        incoming: ChatMessage[],
        retention: MessageRetention = 'keep-latest'
    ) => {
        if (incoming.length === 0) return
        const current = messagesByChannel.value[channelId] ?? []
        const ids = getMessageSet(channelId)
        let changed = false
        const next = [...current]

        for (const msg of incoming) {
            if (!msg.id) continue
            if (ids.has(msg.id)) continue
            ids.add(msg.id)
            next.push(msg)
            changed = true
        }

        if (!changed) return

        next.sort((a, b) => {
            if (a.created_at_unix_us !== b.created_at_unix_us) {
                return a.created_at_unix_us - b.created_at_unix_us
            }
            return a.id.localeCompare(b.id)
        })

        messagesByChannel.value[channelId] = next
        trimMessageWindow(channelId, retention)
    }

    const recomputeVoiceOwnershipFlags = () => {
        const connected = voiceOwnershipConnected.value
        const isOwner = voiceOwnershipIsOwner.value
        voiceConnectedByThisSession.value = connected && isOwner
        voiceConnectedElsewhere.value = connected && !isOwner
    }

    const syncRuntimeVoiceSelectionFromSelfState = () => {
        // Local selection is session runtime state. Only the owner session
        // should adopt authoritative self participant mute/deafen updates.
        if (!voiceConnectedByThisSession.value) return
        const selfId = normalizeId(userId.value)
        if (!selfId) return
        const selfState = voiceStatesByUser.value[selfId]
        if (!selfState) return
        setVoiceMuted(selfState.muted)
        setVoiceDeafened(selfState.deafened)
    }

    // ===== actions =====
    function clearAll() {
        clearAllAttachmentCaches()
        hubs.value = []
        channelsByHub.value = {}
        membersByHub.value = {}
        usersLookup.value = {}
        presenceByUser.value = {}
        typingByChannel.value = {}
        // Clear all typing timeouts
        for (const timeout of typingTimeouts.values()) {
            clearTimeout(timeout)
        }
        typingTimeouts.clear()
        voiceChannelsByKey.value = {}
        userVoiceChannelById.value = {}
        pendingVoiceStateByUser.value = {}
        voiceParticipantsByChannel.value = {}
        voiceStartedAtUnixByChannel.value = {}
        voiceStatesByUser.value = {}
        speakingUsersById.value = {}
        messagesByChannel.value = {}
        historyExhaustedByChannel.value = {}
        channelInitialFetchById.value = {}
        hubJoinCodes.value = {}
        commandErrors.value = {}
        lastHubEventAt.value = null
        lastChannelCreated.value = null
        messageIdsByChannel.clear()
        activeHubId.value = null
        activeChannelId.value = null
        activeVoiceChannelId.value = null
        activeVoiceHubId.value = null
        voiceLatencyMs.value = null
        userVolumeOverrides.value = {}
        voiceConnecting.value = false
        voiceError.value = null
        voiceOwnershipConnected.value = false
        voiceOwnershipIsOwner.value = false
        voiceConnectedByThisSession.value = false
        voiceConnectedElsewhere.value = false
        pendingVoiceTakeover.value = null
        viewingVoiceGrid.value = false
        localCameraEnabled.value = false
        localScreenShareEnabled.value = false
        screenShareAudioMuted.value = false
        voiceNeedsAudioUnlock.value = false
        viewedHubId.value = null
        avatarSeed.value = null
        desktopMembersOpen.value = true
        mobilePanels.value.channelsOpen = false
        mobilePanels.value.membersOpen = false
    }

    /**
     * Authoritative state sync.
     * Called once on connect / reconnect.
     */
    function hydrateFromStateSync(payload: StateSyncPayload) {
        const hubsPayload = payload.hubs ?? []
        const selfId = normalizeId(payload.self?.id)
        const selfName = payload.self?.metadata?.username ?? ''
        const selfAvatar = payload.self?.metadata?.avatar_seed ?? ''

        // identity
        userId.value = selfId || null
        username.value = selfName
        displayName.value = selfName
        avatarSeed.value = selfAvatar.trim().length > 0 ? selfAvatar : null

        // reset state
        clearAllAttachmentCaches()
        hubs.value = []
        channelsByHub.value = {}
        membersByHub.value = {}
        usersLookup.value = {}
        presenceByUser.value = {}
        voiceChannelsByKey.value = {}
        userVoiceChannelById.value = {}
        pendingVoiceStateByUser.value = {}
        voiceParticipantsByChannel.value = {}
        voiceStartedAtUnixByChannel.value = {}
        voiceStatesByUser.value = {}
        speakingUsersById.value = {}
        messagesByChannel.value = {}
        historyExhaustedByChannel.value = {}
        hubJoinCodes.value = {}
        messageIdsByChannel.clear()

        const voiceSnapshots = extractVoiceSnapshotsFromStateSync(hubsPayload)
        for (const snapshot of voiceSnapshots) {
            applyVoiceSnapshot(snapshot, false)
        }
        pendingVoiceStateByUser.value = {}
        rebuildVoiceDerivedState()
        recomputeVoiceOwnershipFlags()

        for (const hubState of hubsPayload) {
            const hubId = normalizeId(hubState.hub?.id)
            if (!hubId) continue

            const channels = normalizeStateSyncChannels(hubId, hubState)
            const members = normalizeStateSyncMembers(hubId, hubState)
            const users = hubState.users ?? []
            const selfMember = members.find(member => member.user_id === selfId)

            hubs.value.push({
                id: hubId,
                name: hubState.hub?.name ?? '',
                role: roleFromProto(selfMember?.role),
                channels_count: channels.length,
                avatar_seed: hubState.hub?.metadata?.avatar_seed ?? '',
            })

            channelsByHub.value[hubId] = channels.map(channel => ({
                id: channel.id,
                name: channel.metadata?.name ?? '',
                type: channel.type === 2 ? ChannelType.Voice : ChannelType.Text,
            }))

            const hubUsers: Record<string, UserInfo> = {}
            for (const userState of users) {
                const user = userState.user
                const hubUserId = normalizeId(user?.id)
                if (!hubUserId) continue
                hubUsers[hubUserId] = {
                    id: hubUserId,
                    username: user?.metadata?.username ?? '',
                    avatar_seed: user?.metadata?.avatar_seed ?? '',
                }
            }
            usersLookup.value[hubId] = hubUsers

            setMembersForHub(hubId, members.map(member => ({
                user_id: member.user_id,
                role: roleFromProto(member.role),
                is_online: member.is_online,
            })))
            for (const member of members) {
                presenceByUser.value[member.user_id] = member.is_online === true
            }

            const joinCode = (hubState.join_code ?? '').trim()
            if (joinCode) {
                hubJoinCodes.value[hubId] = joinCode
            }
        }

        // default selections
        if (hubs.value.length === 0) {
            activeHubId.value = null
            activeChannelId.value = null
            viewedHubId.value = null
            return
        }

        const firstHub = hubs.value[0]
        if (!firstHub) {
            activeHubId.value = null
            activeChannelId.value = null
            viewedHubId.value = null
            return
        }
        const firstHubId = firstHub.id
        const hubIds = new Set(hubs.value.map(h => h.id))

        if (!viewedHubId.value || !hubIds.has(viewedHubId.value)) {
            viewedHubId.value = firstHubId
        }
        if (!activeHubId.value || !hubIds.has(activeHubId.value)) {
            activeHubId.value = firstHubId
        }

        const resolvedHubId = activeHubId.value ?? firstHubId
        if (!isActiveTextChannel(resolvedHubId, activeChannelId.value)) {
            activeChannelId.value = firstTextChannelId(resolvedHubId)
        }
    }

    function mergeStateSync(payload: StateSyncPayload) {
        const hubsPayload = payload.hubs ?? []
        if (hubsPayload.length === 0) return

        const selfId = normalizeId(payload.self?.id)
        const selfName = payload.self?.metadata?.username ?? ''
        const selfAvatar = payload.self?.metadata?.avatar_seed ?? ''

        if (!userId.value && selfId) {
            userId.value = selfId
            username.value = selfName
            displayName.value = selfName
            avatarSeed.value = selfAvatar.trim().length > 0 ? selfAvatar : null
        }

        for (const hubState of hubsPayload) {
            const hubId = normalizeId(hubState.hub?.id)
            if (!hubId) continue

            const channels = normalizeStateSyncChannels(hubId, hubState)
            const members = normalizeStateSyncMembers(hubId, hubState)
            const users = hubState.users ?? []
            const selfMember = members.find(member => member.user_id === selfId)

            if (channels.length === 0 && members.length === 0 && hubs.value.some(hub => hub.id === hubId)) {
                viewedHubId.value = hubId
                activeHubId.value = hubId
                activeChannelId.value = firstTextChannelId(hubId)
                const joinCode = (hubState.join_code ?? '').trim()
                if (joinCode) {
                    hubJoinCodes.value[hubId] = joinCode
                }
                continue
            }

            for (const member of members) {
                presenceByUser.value[member.user_id] = member.is_online
            }

            const hubUsers: Record<string, UserInfo> = usersLookup.value[hubId] ?? {}
            for (const userState of users) {
                const user = userState.user
                const hubUserId = normalizeId(user?.id)
                if (!hubUserId) continue
                hubUsers[hubUserId] = {
                    id: hubUserId,
                    username: user?.metadata?.username ?? '',
                    avatar_seed: user?.metadata?.avatar_seed ?? '',
                }
            }
            usersLookup.value[hubId] = hubUsers

            upsertHubState(
                hubId,
                hubState.hub?.name ?? '',
                roleFromProto(selfMember?.role),
                hubState.hub?.metadata?.avatar_seed ?? '',
                channels,
                members
            )

            const joinCode = (hubState.join_code ?? '').trim()
            if (joinCode) {
                hubJoinCodes.value[hubId] = joinCode
            }

            viewedHubId.value = hubId
            activeHubId.value = hubId
            activeChannelId.value = firstTextChannelId(hubId)
        }

        const scopedHubIds = new Set(
            hubsPayload.map(hubState => normalizeId(hubState.hub?.id)).filter(Boolean)
        )
        if (scopedHubIds.size > 0) {
            const nextVoiceChannelsByKey: Record<string, VoiceChannelStateModel> = {}
            for (const [key, channelState] of Object.entries(voiceChannelsByKey.value)) {
                if (!scopedHubIds.has(channelState.hubId)) {
                    nextVoiceChannelsByKey[key] = channelState
                }
            }
            voiceChannelsByKey.value = nextVoiceChannelsByKey
        }

        const voiceSnapshots = extractVoiceSnapshotsFromStateSync(hubsPayload)
        for (const snapshot of voiceSnapshots) {
            applyVoiceSnapshot(snapshot, false)
        }
        pendingVoiceStateByUser.value = {}
        rebuildVoiceDerivedState()
        recomputeVoiceOwnershipFlags()

        lastHubEventAt.value = Date.now()
    }

    function applyRtSignal(payload: RtSignalPayload) {
        if (payload.presence) {
            applyRtSignalPatch({
                presence_changed: {
                    hub_id: payload.presence.hub_id ?? '',
                    user_id: payload.presence.user_id ?? '',
                    is_online: payload.presence.is_online === true,
                },
            })
            return
        }
        if (payload.typing) {
            applyRtSignalPatch({
                typing: {
                    hub_id: payload.typing.channel?.hub_id ?? '',
                    channel_id: payload.typing.channel?.channel_id ?? '',
                    user_id: payload.typing.user_id ?? '',
                    is_typing: payload.typing.is_typing === true,
                },
            })
        }
    }

    function applyStateDelta(payload: StateDeltaPayload): string[] {
        const missingHubIds = new Set<string>()
        const hubDeltas = payload.hubs ?? []

        const hasHub = (hubId: string): boolean => hubs.value.some(hub => hub.id === hubId)
        const hasChannel = (hubId: string, channelId: string): boolean =>
            (channelsByHub.value[hubId] ?? []).some(channel => channel.id === channelId)

        for (const hubDelta of hubDeltas) {
            const hubId = normalizeId(hubDelta.hub_id)
            if (!hubId) continue

            const hubOps = hubDelta.hub_ops ?? []
            const memberOps = hubDelta.member_ops ?? []
            const userOps = hubDelta.user_ops ?? []
            const channelDeltas = hubDelta.channels ?? []
            const hasHubUpsert = hubOps.some(op => Boolean(op.upsert?.hub))

            if (!hasHub(hubId) && !hasHubUpsert &&
                (memberOps.length > 0 || userOps.length > 0 || channelDeltas.length > 0)) {
                missingHubIds.add(hubId)
            }

            for (const hubOp of hubOps) {
                const upsertHub = hubOp.upsert?.hub
                if (upsertHub) {
                    applyHubPatch({
                        hub_id: hubId,
                        action: 1,
                        hub: {
                            id: upsertHub.id ?? hubId,
                            name: upsertHub.name ?? '',
                            metadata: {
                                avatar_seed: upsertHub.metadata?.avatar_seed ?? '',
                            },
                        },
                    })
                    continue
                }
                if (hubOp.remove) {
                    applyHubPatch({ hub_id: hubId, action: 2 })
                    continue
                }
                if (hubOp.join_code_set) {
                    applyHubJoinCodePatch({
                        hub_id: hubId,
                        join_code: hubOp.join_code_set.join_code ?? '',
                    })
                }
            }

            for (const memberOp of memberOps) {
                const member = memberOp.upsert?.state?.member
                if (member) {
                    upsertHubMemberPatch({
                        member: {
                            hub_id: hubId,
                            user_id: member.user_id ?? '',
                            is_online: member.is_online === true,
                            role: member.role ?? 0,
                        },
                    })
                    continue
                }

                const removedUserId = normalizeId(memberOp.remove?.user_id)
                if (!removedUserId) continue
                removeHubMemberPatch({
                    hub_id: hubId,
                    user_id: removedUserId,
                })
            }

            for (const userOp of userOps) {
                const user = userOp.upsert?.state?.user
                if (user) {
                    const userIdValue = normalizeId(user.id)
                    if (!userIdValue) continue

                    const hubUsers: Record<string, UserInfo> = usersLookup.value[hubId] ?? {}
                    hubUsers[userIdValue] = {
                        id: userIdValue,
                        username: user.metadata?.username ?? '',
                        avatar_seed: user.metadata?.avatar_seed ?? '',
                    }
                    usersLookup.value = { ...usersLookup.value, [hubId]: hubUsers }

                    if (userIdValue === normalizeId(userId.value)) {
                        const nextUsername = user.metadata?.username ?? ''
                        username.value = nextUsername
                        displayName.value = nextUsername
                        const nextAvatar = user.metadata?.avatar_seed ?? ''
                        avatarSeed.value = nextAvatar ? nextAvatar : null
                    }
                    continue
                }

                const removedUserId = normalizeId(userOp.remove?.user_id)
                if (!removedUserId) continue

                const hubUsers = { ...(usersLookup.value[hubId] ?? {}) }
                if (!(removedUserId in hubUsers)) continue
                delete hubUsers[removedUserId]
                usersLookup.value = { ...usersLookup.value, [hubId]: hubUsers }
            }

            for (const channelDelta of channelDeltas) {
                const channelId = normalizeId(channelDelta.channel_id)
                if (!channelId) continue

                const channelOps = channelDelta.channel_ops ?? []
                const messageOps = channelDelta.message_ops ?? []
                const voiceOps = channelDelta.voice_ops ?? []
                const hasChannelUpsert = channelOps.some(op => Boolean(op.upsert?.channel))

                if (!hasChannel(hubId, channelId) && !hasChannelUpsert &&
                    (messageOps.length > 0 || voiceOps.length > 0)) {
                    missingHubIds.add(hubId)
                }

                for (const channelOp of channelOps) {
                    const channel = channelOp.upsert?.channel
                    if (channel) {
                        const upsertChannelId = normalizeId(channel.id ?? channelId)
                        const exists = (channelsByHub.value[hubId] ?? [])
                            .some(ch => ch.id === upsertChannelId)
                        applyChannelPatch({
                            hub_id: hubId,
                            action: exists ? 2 : 1,
                            channel: {
                                id: upsertChannelId,
                                hub_id: hubId,
                                type: channel.type ?? 0,
                                metadata: {
                                    name: channel.metadata?.name ?? '',
                                },
                            },
                        })
                        continue
                    }
                    if (channelOp.remove) {
                        applyChannelPatch({
                            hub_id: hubId,
                            action: 3,
                            channel: {
                                id: channelId,
                            },
                        })
                    }
                }

                for (const messageOp of messageOps) {
                    const appendMessage = messageOp.append?.state?.message
                    if (appendMessage) {
                        appendMessagePatch({
                            channel_id: channelId,
                            message: {
                                id: appendMessage.id ?? '',
                                author_id: appendMessage.author_id ?? '',
                                content: appendMessage.content ?? '',
                                attachments: appendMessage.attachments ?? [],
                                link_preview: appendMessage.link_preview,
                                created_at_unix_us: appendMessage.created_at_unix_us ?? 0,
                            },
                        })
                        continue
                    }

                    const batch = messageOp.batch
                    if (batch) {
                        if ((batch.direction ?? 0) === 1) {
                            completeChannelInitialFetch(channelId)
                        }
                        applyMessageBatchPatch({
                            channel_id: channelId,
                            direction: batch.direction ?? 0,
                            messages: (batch.states ?? [])
                                .map(state => state.message)
                                .filter((message): message is {
                                    id: string
                                    author_id: string
                                    content: string
                                    attachments?: Array<{
                                        id?: string
                                        kind?: number
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
                                    created_at_unix_us: string | number
                                } => Boolean(message?.id))
                                .map(message => ({
                                    id: message.id ?? '',
                                    author_id: message.author_id ?? '',
                                    content: message.content ?? '',
                                    attachments: message.attachments ?? [],
                                    link_preview: message.link_preview,
                                    created_at_unix_us: message.created_at_unix_us ?? 0,
                                })),
                        })
                        if (batch.exhausted_before === true && (batch.direction ?? 0) === 2) {
                            historyExhaustedByChannel.value[channelId] = true
                        }
                        continue
                    }

                    const removedMessageId = normalizeId(messageOp.remove?.message_id)
                    if (!removedMessageId) continue
                    const current = messagesByChannel.value[channelId] ?? []
                    if (current.length > 0) {
                        const filtered = current.filter(message => message.id !== removedMessageId)
                        messagesByChannel.value[channelId] = filtered
                    }
                    messageIdsByChannel.get(channelId)?.delete(removedMessageId)
                }

                for (const voiceOp of voiceOps) {
                    const snapshot = voiceOp.snapshot?.state
                    if (snapshot) {
                        applyVoiceSnapshotPatch({
                            channel: {
                                hub_id: hubId,
                                channel_id: channelId,
                            },
                            started_at_unix: snapshot.started_at_unix ?? 0,
                            participants: (snapshot.participants ?? []).map((participant) => ({
                                user_id: participant.user_id ?? '',
                                muted: participant.muted === true,
                                deafened: participant.deafened === true,
                            })),
                        })
                        continue
                    }

                    const participant = voiceOp.upsert?.participant
                    if (participant) {
                        applyVoiceParticipantActivityPatch({
                            channel: {
                                hub_id: hubId,
                                channel_id: channelId,
                            },
                            participant: {
                                user_id: participant.user_id ?? '',
                                muted: participant.muted === true,
                                deafened: participant.deafened === true,
                            },
                            activity: 1,
                        })
                        applyVoiceParticipantStatePatch({
                            participant: {
                                user_id: participant.user_id ?? '',
                                muted: participant.muted === true,
                                deafened: participant.deafened === true,
                            },
                        })
                        continue
                    }

                    const removedUserId = normalizeId(voiceOp.remove?.user_id)
                    if (!removedUserId) continue
                    applyVoiceParticipantActivityPatch({
                        channel: {
                            hub_id: hubId,
                            channel_id: channelId,
                        },
                        participant: {
                            user_id: removedUserId,
                        },
                        activity: 2,
                    })
                }
            }
        }

        return [...missingHubIds]
    }

    // ===== navigation =====
    function viewHub(hubId: string) {
        viewedHubId.value = hubId
    }

    function activateHub(hubId: string) {
        activeHubId.value = hubId
        activeChannelId.value = firstTextChannelId(hubId)
        viewedHubId.value = hubId
    }

    function activateChannel(channelId: string) {
        activeChannelId.value = channelId
    }

    function channelsForHub(hubId: string): Channel[] {
        return channelsByHub.value[hubId] ?? []
    }

    function membersForHub(hubId: string): Member[] {
        return membersByHub.value[hubId] ?? []
    }

    function setActiveChannel(hubId: string, channelId: string) {
        activeHubId.value = hubId
        activeChannelId.value = channelId
    }

    function setActiveVoiceChannel(hubId: string, channelId: string) {
        activeHubId.value = hubId
        activeVoiceChannelId.value = channelId
        activeVoiceHubId.value = hubId
        speakingUsersById.value = {}
        voiceLatencyMs.value = null
        voiceConnecting.value = true
        voiceError.value = null
        mobilePanels.value.voiceOpen = true
        if (!viewedHubId.value) viewedHubId.value = hubId
        recomputeVoiceOwnershipFlags()
    }

    function clearActiveVoiceChannel() {
        activeVoiceChannelId.value = null
        activeVoiceHubId.value = null
        speakingUsersById.value = {}
        voiceLatencyMs.value = null
        voiceConnecting.value = false
        voiceError.value = null
        mobilePanels.value.voiceOpen = false
        viewingVoiceGrid.value = false
        localCameraEnabled.value = false
        localScreenShareEnabled.value = false
        screenShareAudioMuted.value = false
        voiceNeedsAudioUnlock.value = false
        recomputeVoiceOwnershipFlags()
    }

    function setVoiceConnected(connected: boolean) {
        if (connected) {
            voiceConnecting.value = false
            voiceError.value = null
            // The LiveKit room is connected — this session owns the voice connection.
            // Don't wait for the server's VOICE_SELF_STATUS webhook confirmation to unblock the UI.
            voiceOwnershipConnected.value = true
            voiceOwnershipIsOwner.value = true
            recomputeVoiceOwnershipFlags()
            return
        }
        voiceConnecting.value = false
        if (!connected) {
            voiceNeedsAudioUnlock.value = false
        }
    }

    function setVoiceConnectedByThisSession(connected: boolean) {
        voiceConnectedByThisSession.value = connected
        if (!connected) {
            voiceConnecting.value = false
            voiceNeedsAudioUnlock.value = false
        }
    }

    function setVoiceOwnershipConnected(connected: boolean) {
        voiceOwnershipConnected.value = connected
        recomputeVoiceOwnershipFlags()
    }

    function setVoiceOwnershipIsOwner(isOwner: boolean) {
        voiceOwnershipIsOwner.value = isOwner
        recomputeVoiceOwnershipFlags()
    }

    function setVoiceError(error: string | null) {
        voiceError.value = error
        voiceConnecting.value = false
        if (error) {
            showErrorToast(error)
        }
    }

    function setVideoMode(mode: VideoMode) {
        const normalizedMode: VideoMode = mode === VideoMode.Quality
            ? VideoMode.Quality
            : VideoMode.Performance
        if (videoMode.value === normalizedMode) return
        videoMode.value = normalizedMode
        writeVideoModePreference(normalizedMode)
    }

    function setVoiceNeedsAudioUnlock(needsUnlock: boolean) {
        voiceNeedsAudioUnlock.value = needsUnlock === true
    }

    function setPendingVoiceTakeover(value: PendingVoiceTakeover) {
        pendingVoiceTakeover.value = value
    }

    function clearPendingVoiceTakeover() {
        pendingVoiceTakeover.value = null
    }

    function showVoiceGrid() {
        viewingVoiceGrid.value = true
        if (voiceConnectedByThisSession.value) {
            setRemoteVideoSubscribed(true)
        }
    }

    function hideVoiceGrid() {
        viewingVoiceGrid.value = false
        if (voiceConnectedByThisSession.value) {
            setRemoteVideoSubscribed(false)
        }
    }

    async function toggleCamera() {
        const next = !localCameraEnabled.value
        localCameraEnabled.value = next
        try {
            if (next) {
                await enableCamera()
            } else {
                await disableCamera()
            }
        } catch (err) {
            localCameraEnabled.value = false
            showErrorToast('Kamera açılıp kapatılamadı')
            devWarn('[voice] camera toggle failed', err)
        }
    }

    async function toggleScreenShare() {
        const next = !localScreenShareEnabled.value
        localScreenShareEnabled.value = next
        try {
            if (next) {
                await enableScreenShare()
                screenShareAudioMuted.value = false
            } else {
                await disableScreenShare()
                screenShareAudioMuted.value = false
            }
        } catch (err) {
            localScreenShareEnabled.value = false
            screenShareAudioMuted.value = false
            showErrorToast('Ekran paylaşımı başlatılamadı')
            devWarn('[voice] screen share toggle failed', err)
        }
    }

    function toggleScreenShareAudio() {
        const next = !screenShareAudioMuted.value
        screenShareAudioMuted.value = next
        setScreenShareAudioMuted(next)
    }

    function setVoiceMuted(muted: boolean) {
        voiceMuted.value = muted
        writeVoiceMutedPreference(muted)
    }

    function setVoiceDeafened(deafened: boolean) {
        voiceDeafened.value = deafened
        writeVoiceDeafenedPreference(deafened)
    }

    function setVoiceProcessingSetting(
        key: VoiceProcessingToggleKey,
        enabled: boolean
    ) {
        const nextValue = enabled === true
        if (voiceProcessingSettings.value[key] === nextValue) return
        voiceProcessingSettings.value = {
            ...voiceProcessingSettings.value,
            [key]: nextValue,
        }
        writeVoiceProcessingSetting(key, nextValue)
    }

    function setVoiceInputSensitivityMode(mode: InputSensitivityMode) {
        const nextMode = mode === InputSensitivityMode.Manual
            ? InputSensitivityMode.Manual
            : InputSensitivityMode.Auto
        if (voiceProcessingSettings.value.inputSensitivityMode === nextMode) return
        voiceProcessingSettings.value = {
            ...voiceProcessingSettings.value,
            inputSensitivityMode: nextMode,
        }
        writeVoiceInputSensitivityMode(nextMode)
    }

    function setVoiceInputSensitivityThreshold(value: number) {
        const nextThreshold = normalizeInputSensitivityThreshold(value)
        if (voiceProcessingSettings.value.inputSensitivityThreshold === nextThreshold) return
        voiceProcessingSettings.value = {
            ...voiceProcessingSettings.value,
            inputSensitivityThreshold: nextThreshold,
        }
        writeVoiceInputSensitivityThreshold(nextThreshold)
    }

    function setNoiseCancellationMethod(method: NoiseCancellationMethod) {
        const nextMethod = method === NoiseCancellationMethod.Krisp
            ? NoiseCancellationMethod.Krisp
            : NoiseCancellationMethod.WebRTC
        if (voiceProcessingSettings.value.noiseCancellationMethod === nextMethod) return
        voiceProcessingSettings.value = {
            ...voiceProcessingSettings.value,
            noiseCancellationMethod: nextMethod,
        }
        writeNoiseCancellationMethod(nextMethod)
    }

    function setVoiceProcessingSettings(next: Partial<VoiceProcessingSettings>) {
        for (const key of Object.keys(VOICE_PROCESSING_STORAGE_KEYS) as Array<VoiceProcessingToggleKey>) {
            if (next[key] === undefined) continue
            setVoiceProcessingSetting(key, next[key] === true)
        }
        if (next.noiseCancellationMethod !== undefined) {
            setNoiseCancellationMethod(next.noiseCancellationMethod)
        }
        if (next.inputSensitivityMode !== undefined) {
            setVoiceInputSensitivityMode(next.inputSensitivityMode)
        }
        if (next.inputSensitivityThreshold !== undefined) {
            setVoiceInputSensitivityThreshold(next.inputSensitivityThreshold)
        }
    }

    function setVoiceLatencyMs(value: number | null) {
        voiceLatencyMs.value = value
    }

    function setUserVolumeOverride(userIdInput: string, volumePercent: number) {
        const userId = normalizeId(userIdInput)
        if (!userId) return
        const nextVolume = normalizeParticipantVolumePercent(volumePercent)
        writeStoredParticipantVolume(userId, nextVolume)
        if (nextVolume === DEFAULT_PARTICIPANT_VOLUME_PERCENT) {
            if (!(userId in userVolumeOverrides.value)) return
            const nextOverrides = { ...userVolumeOverrides.value }
            delete nextOverrides[userId]
            userVolumeOverrides.value = nextOverrides
            return
        }
        if (userVolumeOverrides.value[userId] === nextVolume) return
        userVolumeOverrides.value = {
            ...userVolumeOverrides.value,
            [userId]: nextVolume,
        }
    }

    function getUserVolumeOverride(userIdInput: string): number {
        const userId = normalizeId(userIdInput)
        if (!userId) return DEFAULT_PARTICIPANT_VOLUME_PERCENT
        const existing = userVolumeOverrides.value[userId]
        if (existing !== undefined) return existing
        const stored = readStoredParticipantVolume(userId, DEFAULT_PARTICIPANT_VOLUME_PERCENT)
        if (stored !== DEFAULT_PARTICIPANT_VOLUME_PERCENT) {
            userVolumeOverrides.value = {
                ...userVolumeOverrides.value,
                [userId]: stored,
            }
        }
        return stored
    }

    function getVoiceChannelStartedAtUnix(channelIdInput: string | null | undefined): number {
        const channelId = normalizeId(channelIdInput)
        if (!channelId) return 0
        return voiceStartedAtUnixByChannel.value[channelId] ?? 0
    }

    function applyVoiceSelfStatus(event: VoiceSelfStatusEvent) {
        const wasOwner = voiceOwnershipConnected.value && voiceOwnershipIsOwner.value
        const connected = event.connected === true
        const isOwner = connected && event.is_owner === true
        const selfId = normalizeId(userId.value)

        voiceOwnershipConnected.value = connected
        voiceOwnershipIsOwner.value = isOwner

        if (!connected) {
            if (selfId) {
                removeSelfFromAllVoiceChannels()
            }
            // Don't clear active voice channel if a takeover or join is in progress —
            // the intermediate connected=false is from the old session being revoked.
            if ((activeVoiceHubId.value || activeVoiceChannelId.value) &&
                !pendingVoiceTakeover.value && !voiceConnecting.value) {
                clearActiveVoiceChannel()
            } else {
                recomputeVoiceOwnershipFlags()
            }
            return
        }

        // Use server-provided ChannelRef when present, otherwise fall back to scan.
        if (event.channel_id) {
            activeVoiceChannelId.value = event.channel_id
            const hubId = normalizeId(event.hub_id) || findHubIdByChannelId(event.channel_id)
            if (hubId) {
                activeVoiceHubId.value = hubId
            }

            if (isOwner && selfId) {
                const targetHubId = hubId || normalizeId(activeVoiceHubId.value)
                if (targetHubId) {
                    ensureVoiceParticipantInChannel(targetHubId, event.channel_id, selfId, {
                        muted: voiceMuted.value,
                        deafened: voiceDeafened.value,
                    })
                }
            }
        } else {
            syncOwnVoiceChannelFromMembership()
        }

        if (isOwner) {
            voiceConnecting.value = false
            voiceError.value = null
        }

        recomputeVoiceOwnershipFlags()
        if (!wasOwner && isOwner) {
            syncRuntimeVoiceSelectionFromSelfState()
        }
    }

    function messagesForChannel(channelId: string): ChatMessage[] {
        return messagesByChannel.value[channelId] ?? []
    }

    function getLatestMessageCursor(channelId: string): MessageCursor | null {
        const list = messagesByChannel.value[channelId]
        if (!list || list.length === 0) return null
        const latest = list[list.length - 1]
        if (!latest?.id || latest.created_at_unix_us <= 0) return null
        return {
            message_id: latest.id,
            created_at_unix_us: latest.created_at_unix_us,
        }
    }

    function getOldestMessageCursor(channelId: string): MessageCursor | null {
        const list = messagesByChannel.value[channelId]
        if (!list || list.length === 0) return null
        const oldest = list[0]
        if (!oldest?.id || oldest.created_at_unix_us <= 0) return null
        return {
            message_id: oldest.id,
            created_at_unix_us: oldest.created_at_unix_us,
        }
    }

    function isHistoryExhausted(channelId: string): boolean {
        return historyExhaustedByChannel.value[channelId] === true
    }

    function appendMessagePatch(event: MessageAppendPatch) {
        const channelId = normalizeId(event.channel_id)
        if (!channelId || !event.message) return

        const msg = normalizeMessage(channelId, event.message)
        upsertMessages(channelId, [msg], 'keep-latest')
    }

    function applyMessageBatchPatch(event: MessageBatchPatch) {
        const channelId = normalizeId(event.channel_id)
        if (!channelId) return

        if ((event.direction ?? 0) === 1) {
            completeChannelInitialFetch(channelId)
        }

        const incoming = (event.messages ?? []).map(m => normalizeMessage(channelId, m))
        if (incoming.length === 0 && event.direction === 2) {
            historyExhaustedByChannel.value[channelId] = true
        }
        upsertMessages(channelId, incoming, event.direction === 2 ? 'keep-oldest' : 'keep-latest')
    }

    function applyRtSignalPatch(event: RtSignalPatch) {
        const parseId = (value?: string | null): string | null =>
            value && value.length > 0 ? value : null

        const TYPING_TIMEOUT_MS = 5000 // Auto-expire typing after 5 seconds of no signal

        const updateTyping = (channelId: string, typingUserId: string, isTyping: boolean) => {
            const timeoutKey = `${channelId}:${typingUserId}`
            const current = typingByChannel.value[channelId] ?? []
            const exists = current.includes(typingUserId)

            // Clear any existing timeout for this user+channel
            const existingTimeout = typingTimeouts.get(timeoutKey)
            if (existingTimeout) {
                clearTimeout(existingTimeout)
                typingTimeouts.delete(timeoutKey)
            }

            if (isTyping) {
                if (!exists) {
                    setTypingUsersForChannel(channelId, [...current, typingUserId])
                }
                const timeout = setTimeout(() => {
                    const currentList = typingByChannel.value[channelId] ?? []
                    setTypingUsersForChannel(channelId, currentList.filter(id => id !== typingUserId))
                    typingTimeouts.delete(timeoutKey)
                }, TYPING_TIMEOUT_MS)
                typingTimeouts.set(timeoutKey, timeout)
                return
            }

            if (!exists) return
            const next = current.filter(id => id !== typingUserId)
            setTypingUsersForChannel(channelId, next)
        }

        const selfId = userId.value ?? null

        if (event.presence_changed) {
            const changedUserId = parseId(event.presence_changed.user_id)
            if (changedUserId !== null) {
                const isOnline = event.presence_changed.is_online === true
                presenceByUser.value[changedUserId] = isOnline
                if (!isOnline) {
                    for (const [channelKey, users] of Object.entries(typingByChannel.value)) {
                        if (!users.includes(changedUserId)) continue
                        updateTyping(channelKey, changedUserId, false)
                    }
                }
            }
            return
        }

        if (event.typing) {
            const typingUserId = parseId(event.typing.user_id)
            const channelId = parseId(event.typing.channel_id)
            if (typingUserId !== null && channelId !== null && typingUserId !== selfId) {
                updateTyping(channelId, typingUserId, event.typing.is_typing === true)
            }
        }
    }

    function applyVoiceSnapshotPatch(event: VoiceSnapshotPatch) {
        applyVoiceSnapshot(event)
    }

    function applyVoiceParticipantActivityPatch(event: VoiceParticipantActivityPatch) {
        const ref = parseVoiceChannelRef(event, 'voice_activity')
        if (!ref) return

        const memberId = normalizeId(event.participant?.user_id ?? event.user_id ?? '')
        if (!memberId) {
            devWarn('[voice] voice_activity ignored: missing participant.user_id', event)
            return
        }

        const activity = event.activity
        const selfId = normalizeId(userId.value)
        if (activity === 2 &&
            selfId &&
            memberId === selfId &&
            voiceOwnershipConnected.value &&
            voiceOwnershipIsOwner.value &&
            activeVoiceHubId.value === ref.hubId &&
            activeVoiceChannelId.value === ref.channelId) {
            devWarn('[voice] ignored stale self remove while owner session is connected', {
                hubId: ref.hubId,
                channelId: ref.channelId,
                userId: memberId,
            })
            return
        }
        const key = voiceChannelKey(ref.hubId, ref.channelId)
        const nextVoiceChannels = { ...voiceChannelsByKey.value }

        if (activity === 1) {
            const previousKey = userVoiceChannelById.value[memberId]
            if (previousKey && previousKey !== key && nextVoiceChannels[previousKey]) {
                const previousState = nextVoiceChannels[previousKey]
                const previousParticipants = { ...previousState.participantsByUser }
                delete previousParticipants[memberId]
                nextVoiceChannels[previousKey] = {
                    ...previousState,
                    participantsByUser: previousParticipants,
                    startedAtUnix:
                        Object.keys(previousParticipants).length === 0 ? 0 : previousState.startedAtUnix,
                }
            }

            const channelState = nextVoiceChannels[key] ?? {
                hubId: ref.hubId,
                channelId: ref.channelId,
                startedAtUnix: 0,
                participantsByUser: {},
            }
            const participantsByUser = { ...channelState.participantsByUser }
            participantsByUser[memberId] = applyPendingVoiceState(
                memberId,
                normalizeVoiceParticipantState(event.participant ?? event)
            )
            nextVoiceChannels[key] = {
                ...channelState,
                participantsByUser,
            }
        } else if (activity === 2) {
            const mappedKey = userVoiceChannelById.value[memberId]
            if (!nextVoiceChannels[key] && mappedKey && mappedKey !== key) {
                devLog('[voice] stale_event_ignored', {
                    type: 'voice_activity_remove_cross_channel_stale',
                    eventChannelKey: key,
                    mappedChannelKey: mappedKey,
                    userId: memberId,
                })
                return
            }
            const targetKey =
                nextVoiceChannels[key] ? key : (mappedKey && nextVoiceChannels[mappedKey] ? mappedKey : '')
            if (!targetKey) {
                // Duplicate/out-of-order LEFT for unknown user.
                return
            }

            const channelState = nextVoiceChannels[targetKey]
            if (!channelState) return
            const participantsByUser = { ...channelState.participantsByUser }
            delete participantsByUser[memberId]
            nextVoiceChannels[targetKey] = {
                ...channelState,
                participantsByUser,
                startedAtUnix:
                    Object.keys(participantsByUser).length === 0 ? 0 : channelState.startedAtUnix,
            }

            if (pendingVoiceStateByUser.value[memberId]) {
                const nextPending = { ...pendingVoiceStateByUser.value }
                delete nextPending[memberId]
                pendingVoiceStateByUser.value = nextPending
            }
        } else {
            devWarn('[voice] voice_activity ignored: unsupported activity', event)
            return
        }

        voiceChannelsByKey.value = nextVoiceChannels
        rebuildVoiceDerivedState()

        if (memberId === userId.value && voiceConnectedByThisSession.value) {
            syncRuntimeVoiceSelectionFromSelfState()
        }
        syncOwnVoiceChannelFromMembership()
        recomputeVoiceOwnershipFlags()
    }

    function applyVoiceParticipantStatePatch(event: VoiceParticipantStatePatch) {
        const memberId = normalizeId(event.participant?.user_id ?? event.user_id ?? '')
        if (!memberId) {
            devWarn('[voice] voice_state ignored: missing participant.user_id', event)
            return
        }

        const nextState = normalizeVoiceParticipantState(event.participant ?? event)
        const channelKey = userVoiceChannelById.value[memberId]
        if (!channelKey || !voiceChannelsByKey.value[channelKey]) {
            pendingVoiceStateByUser.value = {
                ...pendingVoiceStateByUser.value,
                [memberId]: nextState,
            }
            return
        }

        const channelState = voiceChannelsByKey.value[channelKey]
        const participantsByUser = {
            ...channelState.participantsByUser,
            [memberId]: nextState,
        }
        setVoiceChannelState(channelState.hubId, channelState.channelId, {
            ...channelState,
            participantsByUser,
        })
        rebuildVoiceDerivedState()

        const selfChannelKey = userId.value ? userVoiceChannelById.value[userId.value] : ''
        if (memberId === userId.value &&
            selfChannelKey === channelKey &&
            voiceConnectedByThisSession.value) {
            syncRuntimeVoiceSelectionFromSelfState()
        }
    }

    function upsertHubState(
        hubId: string,
        name: string,
        role: HubRole,
        avatarSeedValue: string,
        channels: Array<{ id: string; hub_id?: string; type: number; metadata?: { name?: string } }>,
        members: Array<{
            hub_id: string
            user_id: string
            is_online: boolean
            role: number
        }>
    ) {
        const roleFromProto = (r?: number): HubRole => {
            switch (r) {
                case 2: return HubRole.Owner
                case 3: return HubRole.Admin
                case 1: default: return HubRole.Member
            }
        }

        const existing = hubs.value.find(h => h.id === hubId)
        if (existing) {
            existing.name = name
            existing.role = role
            existing.channels_count = channels.length
            existing.avatar_seed = avatarSeedValue
            hubs.value = [...hubs.value]
        } else {
            hubs.value.push({
                id: hubId,
                name,
                role,
                channels_count: channels.length,
                avatar_seed: avatarSeedValue,
            })
        }

        channelsByHub.value[hubId] = channels.map(ch => ({
            id: normalizeId(ch.id),
            name: ch.metadata?.name ?? '',
            type: ch.type === 2 ? ChannelType.Voice : ChannelType.Text,
        }))

        setMembersForHub(hubId, members.map(m => ({
            user_id: normalizeId(m.user_id),
            role: roleFromProto(m.role),
            is_online: m.is_online,
        })))

        for (const member of members) {
            const memberId = normalizeId(member.user_id)
            presenceByUser.value[memberId] = member.is_online === true
        }

        if (!viewedHubId.value) viewedHubId.value = hubId
        if (!activeHubId.value) {
            activeHubId.value = hubId
            activeChannelId.value = firstTextChannelId(hubId)
        }
    }

    function removeHubState(hubId: string) {
        hubs.value = hubs.value.filter(h => h.id !== hubId)
        const channelIds = (channelsByHub.value[hubId] ?? []).map(ch => ch.id)
        delete channelsByHub.value[hubId]
        delete membersByHub.value[hubId]
        delete usersLookup.value[hubId]
        delete hubJoinCodes.value[hubId]
        for (const channelId of channelIds) {
            clearAttachmentCachesForChannel(channelId)
            delete typingByChannel.value[channelId]
            delete messagesByChannel.value[channelId]
            delete historyExhaustedByChannel.value[channelId]
            if (channelInitialFetchById.value[channelId]) {
                const nextFetch = { ...channelInitialFetchById.value }
                delete nextFetch[channelId]
                channelInitialFetchById.value = nextFetch
            }
            messageIdsByChannel.delete(channelId)
        }

        if (activeHubId.value === hubId) {
            const nextHub = hubs.value[0]?.id ?? null
            activeHubId.value = nextHub
            viewedHubId.value = nextHub
            activeChannelId.value = firstTextChannelId(nextHub)
        }
        if (viewedHubId.value === hubId) {
            viewedHubId.value = hubs.value[0]?.id ?? null
        }
        purgeVoiceStateForHub(hubId)
    }

    function upsertHubMemberPatch(event: HubMemberUpsertPatch) {
        const member = event.member
        if (!member) return
        const hubId = normalizeId(member.hub_id)
        const memberId = normalizeId(member.user_id)
        if (!hubId || !memberId) return

        const roleFromProto = (r?: number): HubRole => {
            switch (r) {
                case 2:
                    return HubRole.Owner
                case 3:
                    return HubRole.Admin
                default:
                    return HubRole.Member
            }
        }
        const nextRole = roleFromProto(member.role)

        presenceByUser.value[memberId] = member.is_online === true

        // Update usersLookup with user info from event
        if (event.user) {
            const hubUsers = usersLookup.value[hubId] ?? {}
            hubUsers[memberId] = {
                id: event.user.id,
                username: event.user.metadata?.username ?? '',
                avatar_seed: event.user.metadata?.avatar_seed ?? '',
            }
            usersLookup.value = { ...usersLookup.value, [hubId]: hubUsers }
        }

        const current = membersByHub.value[hubId] ?? []
        const exists = current.find(m => m.user_id === memberId)
        if (exists) {
            exists.role = nextRole
            exists.is_online = member.is_online === true
            setMembersForHub(hubId, [...current])
        } else {
            setMembersForHub(
                hubId,
                [...current, { user_id: memberId, role: nextRole, is_online: member.is_online === true }]
            )
        }

        // Keep hub-level self role in sync so UI permission gates (invite/settings/etc.) update immediately.
        if (userId.value && memberId === userId.value) {
            const hub = hubs.value.find(entry => entry.id === hubId)
            if (hub && hub.role !== nextRole) {
                hub.role = nextRole
                hubs.value = [...hubs.value]
            }
        }
    }

    function removeHubMemberPatch(event: HubMemberRemovePatch) {
        const hubId = normalizeId(event.hub_id)
        const memberId = normalizeId(event.user_id)
        if (!hubId || !memberId) return

        if (userId.value && memberId === userId.value) {
            removeHubState(hubId)
            return
        }

        const current = membersByHub.value[hubId] ?? []
        membersByHub.value[hubId] = current.filter(m => m.user_id !== memberId)
    }

    function applyHubPatch(event: HubPatch) {
        const hubId = normalizeId(event.hub_id)
        if (!hubId) return

        // action 1 = UPDATED, action 2 = REMOVED
        if (event.action === 2) {
            removeHubState(hubId)
            return
        }

        if (event.action === 1 && event.hub) {
            const hub = hubs.value.find(h => h.id === hubId)
            if (!hub) return
            if (event.hub.name) hub.name = event.hub.name
            if (event.hub.metadata?.avatar_seed !== undefined) {
                hub.avatar_seed = event.hub.metadata.avatar_seed
            }
            hubs.value = [...hubs.value]
        }
    }

    function applyHubJoinCodePatch(event: HubJoinCodeSetPatch) {
        const hubId = normalizeId(event.hub_id)
        if (!hubId) return
        hubJoinCodes.value[hubId] = event.join_code
    }

    function applyChannelPatch(event: ChannelPatch) {
        const hubId = normalizeId(event.hub_id)
        if (!hubId) return

        // action 1 = CREATED, action 2 = UPDATED, action 3 = REMOVED
        if (event.action === 1) {
            // CREATED
            const channel = event.channel
            if (!channel) return
            const channelId = normalizeId(channel.id)
            if (!channelId) return

            const list = channelsByHub.value[hubId] ?? []
            const exists = list.find(ch => ch.id === channelId)
            const nextType: ChannelType = channel.type === 2
                ? ChannelType.Voice
                : ChannelType.Text
            const channelName = channel.metadata?.name ?? ''

            if (!exists) {
                lastChannelCreated.value = { hubId, channelId }
                channelsByHub.value[hubId] = [...list, { id: channelId, name: channelName, type: nextType }]
            } else {
                exists.name = channelName
                exists.type = nextType
                channelsByHub.value[hubId] = [...list]
            }

            const hub = hubs.value.find(h => h.id === hubId)
            if (hub) {
                hub.channels_count = channelsByHub.value[hubId]?.length ?? hub.channels_count
                hubs.value = [...hubs.value]
            }

            if (!exists && activeHubId.value === hubId && nextType === ChannelType.Text) {
                activeChannelId.value = channelId
            }
            return
        }

        if (event.action === 2) {
            // UPDATED
            const channel = event.channel
            if (!channel) return
            const channelId = normalizeId(channel.id)
            if (!channelId) return

            const list = channelsByHub.value[hubId] ?? []
            const existing = list.find(ch => ch.id === channelId)
            if (!existing) return
            if (channel.metadata?.name !== undefined) {
                existing.name = channel.metadata.name
            }
            channelsByHub.value[hubId] = [...list]
            return
        }

        if (event.action === 3) {
            // REMOVED
            const channel = event.channel
            if (!channel) return
            const channelId = normalizeId(channel.id)
            if (!channelId) return

            const list = channelsByHub.value[hubId] ?? []
            channelsByHub.value[hubId] = list.filter(ch => ch.id !== channelId)

            clearAttachmentCachesForChannel(channelId)
            if (messagesByChannel.value[channelId]) {
                const next = { ...messagesByChannel.value }
                delete next[channelId]
                messagesByChannel.value = next
            }
            if (channelInitialFetchById.value[channelId]) {
                const nextFetch = { ...channelInitialFetchById.value }
                delete nextFetch[channelId]
                channelInitialFetchById.value = nextFetch
            }
            messageIdsByChannel.delete(channelId)
            if (typingByChannel.value[channelId]) {
                const next = { ...typingByChannel.value }
                delete next[channelId]
                typingByChannel.value = next
            }
            removeVoiceChannelState(hubId, channelId)
            rebuildVoiceDerivedState()
            recomputeVoiceOwnershipFlags()

            if (activeHubId.value === hubId && activeChannelId.value === channelId) {
                activeChannelId.value = firstTextChannelId(hubId)
            }

            if (activeVoiceHubId.value === hubId && activeVoiceChannelId.value === channelId) {
                clearActiveVoiceChannel()
            }
        }
    }

    function setSpeakingUsers(userIds: string[]) {
        const next: Record<string, boolean> = {}
        for (const memberId of userIds.map(normalizeId)) {
            if (!memberId) continue
            next[memberId] = true
        }
        speakingUsersById.value = next
    }

    function clearSpeakingUsers() {
        speakingUsersById.value = {}
    }

    function isUserSpeaking(targetUserId: string): boolean {
        return speakingUsersById.value[normalizeId(targetUserId)] === true
    }

    function setCommandError(commandType: number, code: number, message?: string) {
        const safeMessage = message && message.trim().length > 0 ? message : 'Komut başarısız'
        commandErrors.value[commandType] = { code, message: safeMessage }
    }

    function startChannelInitialFetch(channelIdInput: string) {
        const channelId = normalizeId(channelIdInput)
        if (!channelId) return
        if (channelInitialFetchById.value[channelId] === FetchStatus.Done) return
        channelInitialFetchById.value = {
            ...channelInitialFetchById.value,
            [channelId]: FetchStatus.Pending,
        }
    }

    function completeChannelInitialFetch(channelIdInput: string) {
        const channelId = normalizeId(channelIdInput)
        if (!channelId) return
        if (channelInitialFetchById.value[channelId] === FetchStatus.Done) return
        channelInitialFetchById.value = {
            ...channelInitialFetchById.value,
            [channelId]: FetchStatus.Done,
        }
    }

    function hasChannelInitialFetchCompleted(channelIdInput: string | null | undefined): boolean {
        const channelId = normalizeId(channelIdInput)
        if (!channelId) return false
        return channelInitialFetchById.value[channelId] === FetchStatus.Done
    }

    function clearCommandError(commandType?: number) {
        if (commandType === undefined) {
            commandErrors.value = {}
            return
        }
        const next = { ...commandErrors.value }
        delete next[commandType]
        commandErrors.value = next
    }

    return {
        // state
        hubs,
        channelsByHub,
        membersByHub,
        usersLookup,
        presenceByUser,
        typingByChannel,
        voiceChannelsByKey,
        userVoiceChannelById,
        pendingVoiceStateByUser,
        voiceParticipantsByChannel,
        voiceStartedAtUnixByChannel,
        voiceStatesByUser,
        speakingUsersById,
        messagesByChannel,
        historyExhaustedByChannel,
        channelInitialFetchById,
        hubJoinCodes,
        commandErrors,
        lastHubEventAt,
        lastChannelCreated,

        userId,
        username,
        displayName,
        avatarSeed,

        // ui
        activeHubId,
        activeChannelId,
        activeVoiceChannelId,
        activeVoiceHubId,
        voiceMuted,
        voiceDeafened,
        voiceProcessingSettings,
        userVolumeOverrides,
        voiceLatencyMs,
        voiceConnecting,
        voiceConnectionState,
        voiceError,
        voiceOwnershipConnected,
        voiceOwnershipIsOwner,
        voiceConnectedByThisSession,
        voiceConnectedElsewhere,
        pendingVoiceTakeover,
        viewedHubId,
        desktopMembersOpen,
        mobilePanels,
        videoMode,
        voiceNeedsAudioUnlock,
        toggleDesktopMembersPanel,
        openChannelsPanel,
        toggleChannelsPanel,
        openMembersPanel,
        toggleMembersPanel,
        openVoicePanel,
        toggleVoicePanel,
        closeMobilePanels,

        // derived
        activeHub,
        activeChannel,
        viewedHub,
        viewedChannels,
        viewedMembers,
        hasLocalActiveVoice,

        // actions
        clearAll,
        hydrateFromStateSync,
        mergeStateSync,
        applyStateDelta,
        applyRtSignal,
        viewHub,
        activateHub,
        activateChannel,
        setActiveVoiceChannel,
        clearActiveVoiceChannel,
        removeSelfFromAllVoiceChannels,
        purgeVoiceStateForHub,
        setVoiceMuted,
        setVoiceDeafened,
        setVoiceProcessingSetting,
        setNoiseCancellationMethod,
        setVoiceInputSensitivityMode,
        setVoiceInputSensitivityThreshold,
        setVoiceProcessingSettings,
        setVoiceLatencyMs,
        setUserVolumeOverride,
        setVoiceConnected,
        setVoiceConnectedByThisSession,
        setVoiceOwnershipConnected,
        setVoiceOwnershipIsOwner,
        setVoiceError,
        setVideoMode,
        setVoiceNeedsAudioUnlock,
        setPendingVoiceTakeover,
        clearPendingVoiceTakeover,
        viewingVoiceGrid,
        localCameraEnabled,
        localScreenShareEnabled,
        screenShareAudioMuted,
        showVoiceGrid,
        hideVoiceGrid,
        toggleCamera,
        toggleScreenShare,
        toggleScreenShareAudio,
        setSpeakingUsers,
        clearSpeakingUsers,
        applyVoiceSelfStatus,

        // helpers
        channelsForHub,
        membersForHub,
        setActiveChannel,
        getUserVolumeOverride,
        getVoiceChannelStartedAtUnix,
        isUserOnline,
        isUserSpeaking,
        getUserInfo,
        getUserDisplayName,
        messagesForChannel,
        getLatestMessageCursor,
        getOldestMessageCursor,
        isHistoryExhausted,
        getCachedSignedAttachmentUrl,
        ensureSignedAttachmentUrls,
        resolveAttachmentSignedUrl,
        hasCachedAttachmentPreviewObjectUrl,
        getCachedAttachmentPreviewObjectUrl,
        cacheAttachmentPreviewObjectUrl,
        removeCachedAttachmentPreviewObjectUrl,
        setCommandError,
        clearCommandError,
        startChannelInitialFetch,
        completeChannelInitialFetch,
        hasChannelInitialFetchCompleted,
    }
})
