import { ref, computed } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { useAppStore } from '~/stores/app'
import { protoService } from '@/src/services/proto'
import { refreshServerSession, restoreServerSession } from '@/src/services/auth/http'
import { resolveBrowserProxyUrl } from '@/src/utils/resolveBrowserProxyUrl'
import { devError, devLog, devWarn } from '@/src/utils/safeLogger'
import { median } from '@/src/utils/math'
import { monotonicNowMs } from '@/src/utils/time'
import { isDuplicateInFlightVoiceJoin } from '@/src/services/webrtc/voiceTransitionPolicy'
import { useNuxtApp, useRouter } from '#app'
import {
    connectVoice as livekitConnectVoice,
    isVoiceConnected as isLivekitVoiceConnected,
    hasDesiredVoiceTransport,
    leaveVoice as livekitLeaveVoice,
    releaseVoiceTransportForServerTransition,
    rotateVoiceKey as livekitRotateVoiceKey,
    setDeafened as livekitSetDeafened,
    setMicrophoneMuted as livekitSetMicrophoneMuted,
    teardownVoiceSync,
} from '@/src/services/webrtc/livekit'
import type { AuthSession } from '@/stores/auth'
import type { MessageCursor } from '~/stores/app'
import type {
    ChatMessageAttachment,
    ChatMessageLinkPreview,
} from '@/src/features/messages/types'

export enum SocketState {
    IDLE = 'idle',
    CONNECTING = 'connecting',
    LOADING = 'loading',
    READY = 'ready',
    ERROR = 'error'
}

export enum SocketAuthState {
    UNAUTHENTICATED = 'unauthenticated',
    AUTHENTICATED = 'authenticated'
}

// Singleton state
const socket = ref<WebSocket | null>(null)
const state = ref<SocketState>(SocketState.IDLE)
const authState = ref<SocketAuthState>(SocketAuthState.UNAUTHENTICATED)
const connected = computed(() => state.value === SocketState.READY)
const lastClose = ref<{ code: number; reason: string } | null>(null)
// Result of the last HUB_INVITE_VALIDATE response (valid invite preview).
const lastInvitePreview = ref<{ hubId: string; hubName: string; avatarSeed: string } | null>(null)

const ping = {
    rttMs: ref<number | null>(null),
    intervalId: null as number | null,
    pendingSentAtMs: null as number | null,
    timeoutId: null as number | null,
    windowMs: [] as number[],
    emaMs: null as number | null,
    missingSamples: 0
}

const PING_INTERVAL_MS = 1000
const PING_TIMEOUT_MS = 4000
const PING_WINDOW_SIZE = 8
const PING_MAX_MISSING_SAMPLES = 10

const reauth = {
    timeoutId: null as number | null,
    scheduledAtMs: null as number | null
}

// Refresh the JWT this far before it expires. 5 min (not seconds) so the one-shot
// timer still fires in time even when a backgrounded tab throttles timers to ~1/min.
const REAUTH_LEAD_MS = 5 * 60 * 1000

// Attached once: refresh the JWT / re-verify the socket when the tab returns to the
// foreground or the network comes back (the reauth setTimeout does not fire while the
// tab is frozen/backgrounded or the machine sleeps).
let resumeListenersAttached = false

const reconnect = {
    attempts: 0,
    timeoutId: null as number | null,
    countdownId: null as number | null,
    enabled: true,
    inSeconds: ref<number | null>(null)
}

const voiceSession = {
    id: 0,
    hubId: '',
    channelId: '',
    resumeId: '',
    leaveInFlight: false,
    active: false,
    revokedUntil: 0
}
let voiceMicPermissionPrimed = false

let voiceTransition: Promise<void> | null = null
let pendingVoiceMembership: {
    hubId: string
    channelId: string
    sessionId: number
    preferMuted: boolean
    preferDeafened: boolean
} | null = null

const voiceTransitionController = {
    nextId: 0,
    active: null as VoiceTransitionState | null,
    watchdogId: null as number | null,
}

const MESSAGE_LIMIT = 50
const AUTH_OK_TIMEOUT_MS = 5000
const VOICE_REVOKE_COOLDOWN_MS = 5000
const VOICE_ENCRYPTION_RECOVERY_COOLDOWN_MS = 5000
let lastVoiceEncryptionRecoveryAtMs = 0
const pendingInitialActiveChannelQueue: string[] = []
const pendingInitialActiveChannelSet = new Set<string>()

function enqueueInitialActiveChannel(channelId: string) {
    if (!channelId || pendingInitialActiveChannelSet.has(channelId)) return
    pendingInitialActiveChannelSet.add(channelId)
    pendingInitialActiveChannelQueue.push(channelId)
}

function clearInitialActiveChannel(channelId: string) {
    if (!channelId || !pendingInitialActiveChannelSet.has(channelId)) return
    pendingInitialActiveChannelSet.delete(channelId)
    const index = pendingInitialActiveChannelQueue.indexOf(channelId)
    if (index >= 0) pendingInitialActiveChannelQueue.splice(index, 1)
}

function takeAllPendingInitialActiveChannels(): string[] {
    if (pendingInitialActiveChannelSet.size === 0) return []
    const pending = Array.from(pendingInitialActiveChannelSet)
    clearAllPendingInitialActiveChannels()
    return pending
}

function clearAllPendingInitialActiveChannels() {
    pendingInitialActiveChannelQueue.splice(0, pendingInitialActiveChannelQueue.length)
    pendingInitialActiveChannelSet.clear()
}

const voiceTabInstanceId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `voice-tab-${Math.random().toString(36).slice(2, 10)}`

const authOk = {
    timeoutId: null as number | null
}

// Shared promise to prevent multiple concurrent connection attempts
let connectionPromise: Promise<void> | null = null
let authPromise: Promise<void> | null = null
let bootstrapTimeoutMs = 8000
let authResolver: {
    resolve: () => void
    reject: (err: Error) => void
    timeoutId: number | null
} | null = null

type ConnectOptions = {
    timeoutMs?: number
    isReconnect?: boolean
}

type JoinVoiceOptions = {
    force?: boolean
    source?: string
}

type SendMessagePayload = {
    content: string
    attachments?: ChatMessageAttachment[]
    linkPreview?: ChatMessageLinkPreview | null
}

export enum VoiceTransitionKind {
    Join = 'join',
    Leave = 'leave',
    Switch = 'switch',
    Takeover = 'takeover',
    KickRecovery = 'kick_recovery',
}

enum VoiceTransitionPhase {
    Requested = 'requested',
    Joining = 'joining',
    Leaving = 'leaving',
    AwaitingToken = 'awaiting_token',
    AwaitingStatus = 'awaiting_status',
    Completed = 'completed',
    TimedOut = 'timed_out',
}

type VoiceTransitionTarget = {
    hubId: string
    channelId: string
}

type VoiceTransitionState = {
    id: number
    kind: VoiceTransitionKind
    from: VoiceTransitionTarget | null
    to: VoiceTransitionTarget | null
    phase: VoiceTransitionPhase
    startedAt: number
}

type RequestVoiceTransitionOptions = {
    kind?: VoiceTransitionKind
    hubId?: string
    channelId?: string
    force?: boolean
    source?: string
}

type VoiceDisconnectContext = {
    reason?: string
    sessionId?: number
    hubId?: string
    channelId?: string
}

const VOICE_DISCONNECT_TIMEOUT_MS = 2000
const VOICE_TRANSITION_WATCHDOG_MS = 4000

export function useWebSocket() {
    const { $pinia } = useNuxtApp()
    const auth = useAuthStore($pinia)
    const appStore = useAppStore($pinia)
    const router = useRouter()

    const toVoiceTarget = (
        hubId: string | null | undefined,
        channelId: string | null | undefined
    ): VoiceTransitionTarget | null => {
        const safeHubId = (hubId ?? '').trim()
        const safeChannelId = (channelId ?? '').trim()
        if (!safeHubId || !safeChannelId) return null
        return {
            hubId: safeHubId,
            channelId: safeChannelId,
        }
    }

    const isJoinLikeTransition = (transition: VoiceTransitionState | null | undefined): boolean => {
        if (!transition) return false
        if (transition.phase === VoiceTransitionPhase.TimedOut ||
            transition.phase === VoiceTransitionPhase.Completed) {
            return false
        }
        return transition.kind === VoiceTransitionKind.Join ||
            transition.kind === VoiceTransitionKind.Switch ||
            transition.kind === VoiceTransitionKind.Takeover
    }

    const clearVoiceTransitionWatchdog = () => {
        if (voiceTransitionController.watchdogId !== null) {
            clearTimeout(voiceTransitionController.watchdogId)
            voiceTransitionController.watchdogId = null
        }
    }

    const scheduleVoiceTransitionWatchdog = (transition: VoiceTransitionState) => {
        if (typeof window === 'undefined') return
        clearVoiceTransitionWatchdog()
        voiceTransitionController.watchdogId = window.setTimeout(() => {
            const active = voiceTransitionController.active
            if (!active || active.id !== transition.id) return
            active.phase = VoiceTransitionPhase.TimedOut
            devWarn('[voice] transition_timeout', {
                transitionId: active.id,
                kind: active.kind,
                from: active.from,
                to: active.to,
                startedAt: active.startedAt,
            })
            const scopedHubId = active.to?.hubId
            if (scopedHubId) {
                void sendRequestStateSync([scopedHubId])
            } else {
                void sendRequestStateSync()
            }
            clearVoiceTransitionWatchdog()
            if (voiceTransitionController.active?.id === active.id) {
                voiceTransitionController.active = null
            }
        }, VOICE_TRANSITION_WATCHDOG_MS)
    }

    const startVoiceTransition = (
        kind: VoiceTransitionKind,
        from: VoiceTransitionTarget | null,
        to: VoiceTransitionTarget | null
    ): VoiceTransitionState => {
        if (voiceTransitionController.active) {
            devLog('[voice] stale_event_ignored', {
                type: 'voice_transition_superseded',
                supersededTransitionId: voiceTransitionController.active.id,
                supersededKind: voiceTransitionController.active.kind,
            })
        }
        clearVoiceTransitionWatchdog()
        const next: VoiceTransitionState = {
            id: voiceTransitionController.nextId + 1,
            kind,
            from,
            to,
            phase: VoiceTransitionPhase.Requested,
            startedAt: Date.now(),
        }
        voiceTransitionController.nextId = next.id
        voiceTransitionController.active = next
        devLog('[voice] transition_start', {
            transitionId: next.id,
            kind: next.kind,
            from: next.from,
            to: next.to,
            startedAt: next.startedAt,
        })
        if (kind !== VoiceTransitionKind.Leave && kind !== VoiceTransitionKind.KickRecovery) {
            scheduleVoiceTransitionWatchdog(next)
        }
        return next
    }

    const updateVoiceTransitionPhase = (
        transitionId: number,
        phase: VoiceTransitionPhase,
        details?: Record<string, unknown>
    ) => {
        const active = voiceTransitionController.active
        if (!active || active.id !== transitionId) return
        active.phase = phase
        devLog('[voice] transition_intermediate', {
            transitionId: active.id,
            kind: active.kind,
            phase,
            ...(details ?? {}),
        })
    }

    const completeVoiceTransition = (transitionId: number, details?: Record<string, unknown>) => {
        const active = voiceTransitionController.active
        if (!active || active.id !== transitionId) return
        active.phase = VoiceTransitionPhase.Completed
        devLog('[voice] transition_complete', {
            transitionId: active.id,
            kind: active.kind,
            from: active.from,
            to: active.to,
            ...(details ?? {}),
        })
        clearVoiceTransitionWatchdog()
        if (voiceTransitionController.active?.id === transitionId) {
            voiceTransitionController.active = null
        }
    }

    const resolveVoiceTransitionKind = (
        hubId: string,
        channelId: string,
        requestedKind?: VoiceTransitionKind
    ): VoiceTransitionKind => {
        if (requestedKind) return requestedKind
        if (appStore.voiceConnectedElsewhere) return VoiceTransitionKind.Takeover
        const currentHubId = voiceSession.hubId || appStore.activeVoiceHubId || ''
        const currentChannelId = voiceSession.channelId || appStore.activeVoiceChannelId || ''
        if (currentHubId && currentChannelId &&
            (currentHubId !== hubId || currentChannelId !== channelId)) {
            return VoiceTransitionKind.Switch
        }
        return VoiceTransitionKind.Join
    }

    async function ensureVoiceMicrophonePermissionOnUserGesture(): Promise<boolean> {
        if (!import.meta.client) return true
        if (voiceMicPermissionPrimed) return true

        if (!navigator.mediaDevices?.getUserMedia) {
            appStore.setVoiceError('Bu tarayıcı mikrofon erişimini desteklemiyor')
            return false
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            for (const track of stream.getTracks()) {
                track.stop()
            }
            voiceMicPermissionPrimed = true
            return true
        } catch (error: unknown) {
            const err = error as { name?: string; message?: string }
            let message = 'Mikrofon erişimi sağlanamadı'
            if (err?.name === 'NotAllowedError') message = 'Mikrofon izni reddedildi'
            else if (err?.name === 'NotFoundError') message = 'Mikrofon bulunamadı'
            else if (err?.name === 'NotReadableError') message = 'Mikrofon başka bir uygulama tarafından kullanılıyor'
            else if (err?.name === 'SecurityError') message = 'Mikrofon için güvenli bağlantı (HTTPS) gerekli'

            appStore.setVoiceError(message)
            return false
        }
    }

    async function recoverVoiceAfterTransportDisconnect(
        sessionId: number,
        hubId: string,
        channelId: string,
        details: { reason?: string; reconnectReasonCount?: number } = {}
    ) {
        if (!import.meta.client) return
        if (sessionId !== voiceSession.id) return
        if (voiceSession.leaveInFlight) return
        if (!hubId || !channelId) return

        const activeTransition = voiceTransitionController.active
        if (activeTransition?.kind === VoiceTransitionKind.Leave) {
            devWarn('[voice] recoverable disconnect ignored during explicit leave', {
                sessionId,
                hubId,
                channelId,
                reason: details.reason ?? 'unknown',
            })
            return
        }

        const target = { hubId, channelId }
        if (!isDuplicateInFlightVoiceJoin(activeTransition, target)) {
            const transition = startVoiceTransition(
                VoiceTransitionKind.Join,
                toVoiceTarget(
                    voiceSession.hubId || appStore.activeVoiceHubId || '',
                    voiceSession.channelId || appStore.activeVoiceChannelId || ''
                ),
                target
            )
            updateVoiceTransitionPhase(transition.id, VoiceTransitionPhase.AwaitingToken, {
                reason: 'recoverable_livekit_disconnect',
                transportReason: details.reason ?? 'unknown',
            })
        } else {
            devWarn('[voice] recoverable disconnect rejoin merged into active transition', {
                transitionId: activeTransition?.id,
                sessionId,
                hubId,
                channelId,
                reason: details.reason ?? 'unknown',
            })
        }

        voiceSession.active = true
        voiceSession.leaveInFlight = false
        voiceSession.hubId = hubId
        voiceSession.channelId = channelId
        voiceSession.resumeId = ''
        voiceSession.revokedUntil = 0

        appStore.setVoiceOwnershipConnected(false)
        appStore.setVoiceOwnershipIsOwner(false)
        appStore.setActiveVoiceChannel(hubId, channelId)

        pendingVoiceMembership = {
            hubId,
            channelId,
            sessionId,
            preferMuted: appStore.voiceMuted || appStore.voiceDeafened,
            preferDeafened: appStore.voiceDeafened,
        }

        devWarn('[voice] recoverable disconnect queued rejoin', {
            sessionId,
            hubId,
            channelId,
            reason: details.reason ?? 'unknown',
            reconnectReasonCount: details.reconnectReasonCount ?? 0,
            socketState: state.value,
        })

        if (state.value === SocketState.READY && socket.value) {
            await flushPendingVoiceMembership()
        }
    }

    async function connectVoice(
        token: string,
        sessionId: number,
        hubId: string,
        channelId: string,
        e2eeKey?: string,
        livekitUrl?: string,
        e2eeKeyIndex?: number
    ) {
        if (!import.meta.client) return
        const resolvedLivekitUrl = livekitUrl ?? ''
        if (!resolvedLivekitUrl) {
            devWarn('[voice] missing livekit_url in token payload', {
                sessionId,
                hubId,
                channelId
            })
            appStore.setVoiceError('Ses sunucu adresi eksik')
            return
        }
        try {
            void livekitConnectVoice(token, {
                sessionId,
                livekitUrl: resolvedLivekitUrl,
                e2eeKey,
                e2eeKeyIndex,
                onEncryptionError: async () => {
                    if (sessionId !== voiceSession.id) return
                    if (voiceSession.leaveInFlight) return
                    if (!hubId || !channelId) return

                    const nowMs = Date.now()
                    if (nowMs - lastVoiceEncryptionRecoveryAtMs <
                        VOICE_ENCRYPTION_RECOVERY_COOLDOWN_MS) {
                        devWarn('[voice] encryption recovery skipped (cooldown)', {
                            sessionId,
                            hubId,
                            channelId,
                            cooldownMs: VOICE_ENCRYPTION_RECOVERY_COOLDOWN_MS,
                        })
                        return
                    }

                    lastVoiceEncryptionRecoveryAtMs = nowMs
                    devWarn('[voice] encryption recovery requested', {
                        sessionId,
                        hubId,
                        channelId,
                    })

                    await requestVoiceTransition({
                        kind: undefined,
                        hubId,
                        channelId,
                        force: true,
                        source: 'encryption_error_recovery',
                    })
                },
                onJoined: async () => {
                    if (sessionId !== voiceSession.id) return
                    if (voiceSession.leaveInFlight) return

                    // Apply local media state to the transport.
                    const isMuted = appStore.voiceMuted
                    const isDeafened = appStore.voiceDeafened

                    await livekitSetMicrophoneMuted(isMuted || isDeafened)
                    livekitSetDeafened(isDeafened)
                },
                onPermanentDisconnect: async (details) => {
                    devWarn('[voice] permanent disconnect finalized', {
                        sessionId,
                        hubId,
                        channelId,
                        reason: details?.reason ?? 'unknown',
                        recoverable: details?.recoverable ?? false,
                    })
                    await finalizeVoiceLeave(sessionId, hubId, channelId)
                },
                onRecoverableDisconnect: async (details) => {
                    await recoverVoiceAfterTransportDisconnect(sessionId, hubId, channelId, details)
                },
            })
        } catch (err) {
            devError('[voice] join failed', err)
        }
    }

    async function disconnectVoice(context: VoiceDisconnectContext = {}) {
        if (!import.meta.client) return
        const hubId = context.hubId || voiceSession.hubId || appStore.activeVoiceHubId || ''
        const channelId =
            context.channelId || voiceSession.channelId || appStore.activeVoiceChannelId || ''
        const sessionId = context.sessionId ?? voiceSession.id
        let timeoutId: ReturnType<typeof setTimeout> | null = null
        let didTimeout = false
        devLog('[voice] disconnect before', {
            reason: context.reason ?? 'unspecified',
            sessionId,
            hubId,
            channelId,
            voiceSessionActive: voiceSession.active,
            activeVoiceHubId: appStore.activeVoiceHubId,
            activeVoiceChannelId: appStore.activeVoiceChannelId
        })
        try {
            const timeoutPromise = new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => {
                    didTimeout = true
                    reject(new Error('voice_disconnect_timeout'))
                }, VOICE_DISCONNECT_TIMEOUT_MS)
            })
            await Promise.race([livekitLeaveVoice(), timeoutPromise])
            devLog('[voice] disconnect after', {
                sessionId,
                hubId,
                channelId,
                roomConnected: isLivekitVoiceConnected(),
                voiceSessionActive: voiceSession.active,
                activeVoiceHubId: appStore.activeVoiceHubId,
                activeVoiceChannelId: appStore.activeVoiceChannelId
            })
        } catch (err) {
            teardownVoiceSync()
            devError('[voice] leave failed', err)
            if (didTimeout) {
                devWarn('[voice] disconnect timeout fallback applied', {
                    sessionId,
                    hubId,
                    channelId,
                    timeoutMs: VOICE_DISCONNECT_TIMEOUT_MS,
                })
            }
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId)
            }
            voiceSession.active = false
            voiceSession.resumeId = ''
            devLog('[voice] disconnect final state', {
                sessionId,
                hubId,
                channelId,
                voiceSessionActive: voiceSession.active,
                activeVoiceHubId: appStore.activeVoiceHubId,
                activeVoiceChannelId: appStore.activeVoiceChannelId
            })
        }
    }

    async function releaseLocalVoiceTransportFromServerStatus(
        reason: string,
        preserveJoinIntent: boolean
    ) {
        if (!import.meta.client) return
        try {
            const hasLocalTransport =
                isLivekitVoiceConnected() ||
                appStore.voiceConnectedByThisSession ||
                appStore.localCameraEnabled ||
                appStore.localScreenShareEnabled
            if (!hasLocalTransport) return

            if (preserveJoinIntent) {
                await releaseVoiceTransportForServerTransition()
            } else {
                await disconnectVoice({
                    reason: `${reason}_server_status`,
                })
                voiceSession.active = false
                voiceSession.leaveInFlight = false
                voiceSession.hubId = ''
                voiceSession.channelId = ''
                voiceSession.resumeId = ''
                if (pendingVoiceMembership?.sessionId === voiceSession.id) {
                    pendingVoiceMembership = null
                }
            }
            appStore.setVoiceConnected(false)
            appStore.setVoiceConnectedByThisSession(false)
            devWarn('[voice] local transport released from server status', {
                reason,
                preserveJoinIntent,
            })
        } catch (err) {
            devError('[voice] failed to release local transport from server status', err)
        }
    }

    async function sendJoinVoiceRequest(
        hubId: string,
        channelId: string,
        options: { preferMuted?: boolean; preferDeafened?: boolean } = {}
    ): Promise<boolean> {
        const preferMuted = options.preferMuted === true
        const preferDeafened = options.preferDeafened === true
        if (state.value !== SocketState.READY || !socket.value) {
            devWarn('[socket] voice join request skipped, not ready')
            pendingVoiceMembership = {
                hubId,
                channelId,
                sessionId: voiceSession.id,
                preferMuted,
                preferDeafened,
            }
            return false
        }
        if (!hubId || !channelId) {
            devWarn('[socket] voice join request skipped, missing ids')
            return false
        }

        const { EnvelopeType } = protoService
        const payload =
            protoService.encodeJoinVoiceChannelRequest(
                hubId,
                channelId,
                {
                    prefer_muted: preferMuted,
                    prefer_deafened: preferDeafened,
                }
            )
        const envelopeBytes = protoService.encodeEnvelope(
            EnvelopeType.VOICE_JOIN as number,
            payload
        )

        const sent = sendEnvelope(envelopeBytes)
        if (!sent) return false
        if (pendingVoiceMembership &&
            pendingVoiceMembership.sessionId === voiceSession.id &&
            pendingVoiceMembership.hubId === hubId &&
            pendingVoiceMembership.channelId === channelId &&
            pendingVoiceMembership.preferMuted === preferMuted &&
            pendingVoiceMembership.preferDeafened === preferDeafened) {
            pendingVoiceMembership = null
        }
        return true
    }

    async function finalizeVoiceLeave(
        sessionId: number,
        hubId: string,
        channelId: string,
        disconnectLocal = true
    ) {
        if (sessionId !== voiceSession.id) return
        if (voiceSession.leaveInFlight) return

        voiceSession.leaveInFlight = true
        if (disconnectLocal) {
            await disconnectVoice({
                reason: 'finalize_leave',
                sessionId,
                hubId,
                channelId
            })
        }

        if (sessionId === voiceSession.id) {
            voiceSession.active = false
            voiceSession.leaveInFlight = false
            voiceSession.hubId = ''
            voiceSession.channelId = ''
            voiceSession.resumeId = ''
            appStore.setVoiceConnectedByThisSession(false)
            if (disconnectLocal) {
                appStore.clearActiveVoiceChannel()
            }
            if (pendingVoiceMembership?.sessionId === sessionId) {
                pendingVoiceMembership = null
            }
        }

        const activeTransition = voiceTransitionController.active
        if (activeTransition &&
            isJoinLikeTransition(activeTransition) &&
            activeTransition.to?.hubId === hubId &&
            activeTransition.to?.channelId === channelId) {
            completeVoiceTransition(activeTransition.id, {
                reason: 'join_like_transition_finalized_by_leave',
                sessionId,
                disconnectLocal,
            })
        }
    }

    async function flushPendingVoiceMembership() {
        if (!pendingVoiceMembership) return
        if (pendingVoiceMembership.sessionId !== voiceSession.id) {
            pendingVoiceMembership = null
            return
        }
        const pending = pendingVoiceMembership
        if (isVoiceJoinBlocked(false)) {
            devWarn('[voice] pending join skipped during revoke cooldown', {
                sessionId: pending.sessionId,
                hubId: pending.hubId,
                channelId: pending.channelId,
                revokedUntil: voiceSession.revokedUntil
            })
            pendingVoiceMembership = null
            return
        }
        await sendJoinVoiceRequest(pending.hubId, pending.channelId, {
            preferMuted: pending.preferMuted,
            preferDeafened: pending.preferDeafened,
        })
    }

    function resetLocalVoiceSessionState(clearActiveVoice = false) {
        voiceSession.active = false
        voiceSession.leaveInFlight = false
        voiceSession.hubId = ''
        voiceSession.channelId = ''
        voiceSession.resumeId = ''
        pendingVoiceMembership = null
        appStore.clearPendingVoiceTakeover()
        if (clearActiveVoice) {
            appStore.clearActiveVoiceChannel()
        }
    }

    async function confirmVoiceTakeover(hubId: string, channelId: string) {
        if (!hubId || !channelId) return
        voiceSession.revokedUntil = 0
        appStore.clearPendingVoiceTakeover()
        await requestVoiceTransition({
            kind: VoiceTransitionKind.Takeover,
            hubId,
            channelId,
            force: true,
            source: 'confirm_takeover',
        })
    }

    function cancelVoiceTakeover() {
        resetLocalVoiceSessionState(false)
    }

    async function handleVoiceSelfRevoked(_revoked: Record<string, never>) {
        const hubId = voiceSession.hubId || appStore.activeVoiceHubId || ''
        const channelId = voiceSession.channelId || appStore.activeVoiceChannelId || ''
        const sessionId = voiceSession.id
        const recoveryTransition = startVoiceTransition(
            VoiceTransitionKind.KickRecovery,
            toVoiceTarget(hubId, channelId),
            null
        )
        updateVoiceTransitionPhase(recoveryTransition.id, VoiceTransitionPhase.Leaving, {
            reason: 'voice_self_revoked',
        })
        voiceSession.revokedUntil = Date.now() + VOICE_REVOKE_COOLDOWN_MS
        pendingVoiceMembership = null
        devWarn('[voice] self revoked', {
            sessionId,
            hubId,
            channelId
        })
        devLog('[voice] voice_self_revoked_received', {
            tabInstanceId: voiceTabInstanceId,
            wsConnId: null,
            activeVoiceHubId: appStore.activeVoiceHubId,
            activeVoiceChannelId: appStore.activeVoiceChannelId,
            voiceSessionActive: voiceSession.active,
            roomConnected: isLivekitVoiceConnected(),
            revokedUntil: voiceSession.revokedUntil
        })
        await disconnectVoice({
            reason: 'self_revoked',
            sessionId,
            hubId,
            channelId
        })
        appStore.setVoiceConnected(false)
        appStore.setVoiceConnectedByThisSession(false)
        appStore.setVoiceOwnershipConnected(true)
        appStore.setVoiceOwnershipIsOwner(false)
        resetLocalVoiceSessionState(false)
        completeVoiceTransition(recoveryTransition.id, {
            reason: 'voice_self_revoked_cleanup_complete',
            sessionId,
        })
        devLog('[voice] self revoked reset', {
            sessionId,
            roomConnected: isLivekitVoiceConnected(),
            activeVoiceHubId: appStore.activeVoiceHubId,
            activeVoiceChannelId: appStore.activeVoiceChannelId,
            revokedUntil: voiceSession.revokedUntil
        })
    }

    function isVoiceJoinBlocked(force = false) {
        if (force) return false
        return voiceSession.revokedUntil > Date.now()
    }

    function stopPingLoop() {
        if (ping.intervalId) {
            clearInterval(ping.intervalId)
            ping.intervalId = null
        }
        if (ping.timeoutId) {
            clearTimeout(ping.timeoutId)
            ping.timeoutId = null
        }
        ping.pendingSentAtMs = null
        ping.windowMs = []
        ping.emaMs = null
        ping.missingSamples = 0
        ping.rttMs.value = null
    }

    function pruneStalePings(nowMs: number) {
        if (ping.pendingSentAtMs !== null && nowMs - ping.pendingSentAtMs > PING_TIMEOUT_MS) {
            ping.pendingSentAtMs = null
            ping.missingSamples += 1
            if (ping.emaMs !== null && ping.missingSamples <= PING_MAX_MISSING_SAMPLES) {
                ping.rttMs.value = Math.round(ping.emaMs)
            } else {
                ping.rttMs.value = null
            }
        }
    }

    function observePingSample(rawRttMs: number) {
        const sampleMs = Math.round(rawRttMs)
        if (!Number.isFinite(sampleMs) || sampleMs <= 0 || sampleMs > 10000) return

        ping.missingSamples = 0
        ping.windowMs.push(sampleMs)
        if (ping.windowMs.length > PING_WINDOW_SIZE) {
            ping.windowMs.shift()
        }

        const windowMedian = median(ping.windowMs)
        const alpha = 0.25
        const nextEma = ping.emaMs === null
            ? windowMedian
            : alpha * windowMedian + (1 - alpha) * ping.emaMs
        ping.emaMs = nextEma
        ping.rttMs.value = Math.round(nextEma)
    }

    function clearReauthTimer() {
        if (reauth.timeoutId) {
            clearTimeout(reauth.timeoutId)
            reauth.timeoutId = null
        }
        reauth.scheduledAtMs = null
    }

    function clearAuthOkTimeout() {
        if (authOk.timeoutId) {
            clearTimeout(authOk.timeoutId)
            authOk.timeoutId = null
        }
    }

    function startAuthOkTimeout() {
        if (typeof window === 'undefined') return
        clearAuthOkTimeout()
        authOk.timeoutId = window.setTimeout(() => {
            authOk.timeoutId = null
            if (!socket.value) return
            if (state.value === SocketState.READY) return
            devWarn('[socket] AUTH_OK timeout', {
                state: state.value,
                authState: authState.value
            })
            authState.value = SocketAuthState.UNAUTHENTICATED
            state.value = SocketState.ERROR
            lastClose.value = { code: 4401, reason: 'auth_timeout' }
            try {
                socket.value.close(4401, 'auth_timeout')
            } catch {
                socket.value.close()
            }
        }, AUTH_OK_TIMEOUT_MS)
    }

    function clearReconnectTimer() {
        if (reconnect.timeoutId) {
            clearTimeout(reconnect.timeoutId)
            reconnect.timeoutId = null
        }
    }

    function resetReconnectAttempts() {
        reconnect.attempts = 0
        clearReconnectState()
    }

    function clearReconnectCountdown() {
        if (reconnect.countdownId) {
            clearInterval(reconnect.countdownId)
            reconnect.countdownId = null
        }
        reconnect.inSeconds.value = null
    }

    function clearReconnectState() {
        clearReconnectTimer()
        clearReconnectCountdown()
    }

    function sendEnvelope(envelopeBytes: Uint8Array): boolean {
        if (!socket.value || socket.value.readyState !== WebSocket.OPEN) return false
        const payload = new Uint8Array(envelopeBytes).buffer
        socket.value.send(payload)
        return true
    }

    function forceLogout(reason: string) {
        devWarn('[socket] force logout', reason, {
            state: state.value,
            authState: authState.value,
            lastClose: lastClose.value
        })
        reconnect.enabled = false
        clearReconnectState()
        stopPingLoop()
        clearReauthTimer()
        clearAuthOkTimeout()
        authState.value = SocketAuthState.UNAUTHENTICATED
        clearAllPendingInitialActiveChannels()
        appStore.setVoiceConnectedByThisSession(false)
        voiceSession.resumeId = ''
        void disconnectVoice({ reason: 'force_logout' })
        connectionPromise = null
        if (socket.value) {
            try {
                socket.value.close(4401, reason)
            } catch {
                socket.value.close()
            }
        }
        socket.value = null
        state.value = SocketState.ERROR
        lastClose.value = { code: 4401, reason }
        void auth.logoutWithTransition(router, async () => {
            appStore.clearAll()
        })
    }

    function scheduleReconnect(reason: string) {
        if (typeof window === 'undefined') return
        if (!reconnect.enabled) return
        if (reconnect.timeoutId) return

        const maxAttempts = 60
        if (reconnect.attempts >= maxAttempts) {
            devWarn('[socket] reconnect attempts exhausted')
            state.value = SocketState.ERROR
            clearReconnectState()
            return
        }

        // First attempt is immediate, subsequent attempts wait 5 seconds.
        const delay = reconnect.attempts === 0 ? 0 : 5000

        reconnect.attempts += 1
        devWarn('[socket] scheduling reconnect', reason, `attempt=${reconnect.attempts}`,
            `delay=${Math.round(delay)}ms`)

        clearReconnectCountdown()
        reconnect.inSeconds.value = Math.ceil(delay / 1000)
        if (delay > 0) {
            reconnect.countdownId = window.setInterval(() => {
                if (reconnect.inSeconds.value === null) return
                reconnect.inSeconds.value = Math.max(reconnect.inSeconds.value - 1, 0)
                if (reconnect.inSeconds.value <= 0) {
                    clearReconnectCountdown()
                }
            }, 1000)
        }

        reconnect.timeoutId = window.setTimeout(() => {
            reconnect.timeoutId = null
            void connect({ timeoutMs: 8000, isReconnect: true }).catch((err) => {
                devWarn('[socket] reconnect failed', err)
                scheduleReconnect('retry')
            })
        }, delay)
    }

    async function refreshAndReauth() {
        try {
            const authSession = await refreshServerSession()
            if (!authSession) {
                devWarn('[socket] token refresh failed: no session returned')
                forceLogout('token_refresh_failed')
                return
            }

            auth.setSession(authSession)
            scheduleReauth(authSession, true)
            await sendReauth(authSession.access_token)
        } catch (err) {
            devWarn('[socket] token refresh failed', err)
            forceLogout('token_refresh_failed')
        }
    }

    function scheduleReauth(session: AuthSession, force = false) {
        if (typeof window === 'undefined') return

        const targetAtMs = session.expires_at * 1000 - REAUTH_LEAD_MS

        if (!force && reauth.scheduledAtMs !== null && targetAtMs >= reauth.scheduledAtMs) {
            return
        }

        clearReauthTimer()
        reauth.scheduledAtMs = targetAtMs

        const waitMs = Math.max(targetAtMs - Date.now(), 0)
        reauth.timeoutId = window.setTimeout(() => {
            clearReauthTimer()
            void refreshAndReauth()
        }, waitMs)
    }

    // Refresh the JWT and re-verify the socket when the tab/app returns to the
    // foreground or the network comes back. The proactive reauth is a single long
    // setTimeout (~1h out); it does NOT fire while the tab is frozen/backgrounded or
    // the machine sleeps, so the access token silently expires and the server closes
    // 4402. Refreshing on resume renews the token the moment the user returns — ideally
    // before the server's heartbeat closes the connection — and reconnects if it has
    // already dropped (connect() -> resolveToken() refreshes the JWT in the handshake).
    async function handleResume(trigger: string) {
        if (typeof window === 'undefined') return
        // Only relevant for a logged-in user.
        if (!auth.isAuthenticated && !auth.session) return

        const sock = socket.value
        const readyState = sock ? sock.readyState : WebSocket.CLOSED

        // A socket is still alive — never spawn a second one (that would orphan this
        // connection on the server). Mid-handshake: leave it to the connect flow.
        if (readyState === WebSocket.CONNECTING) return
        if (readyState === WebSocket.OPEN) {
            if (authState.value === SocketAuthState.AUTHENTICATED) {
                const expiresAtMs = auth.session?.expires_at ? auth.session.expires_at * 1000 : null
                // Refresh if the access token has expired or is within the reauth lead window.
                const nearExpiry = !expiresAtMs || expiresAtMs <= Date.now() + REAUTH_LEAD_MS
                if (nearExpiry) {
                    devWarn('[socket] resume: refreshing JWT', { trigger })
                    await refreshAndReauth()
                }
                // Nudge liveness so a half-open socket (e.g. after sleep) is detected fast.
                void sendPing().catch(() => {})
            }
            return
        }

        // No live socket (closed/closing) — reconnect now.
        if (state.value !== SocketState.CONNECTING) {
            devWarn('[socket] resume: reconnecting', { trigger, state: state.value })
            reconnect.enabled = true
            void connect({ timeoutMs: 8000, isReconnect: true }).catch((err) => {
                devWarn('[socket] resume reconnect failed', err)
                scheduleReconnect('resume')
            })
        }
    }

    function setupResumeListeners() {
        if (resumeListenersAttached || typeof window === 'undefined') return
        resumeListenersAttached = true
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') void handleResume('visibilitychange')
        })
        window.addEventListener('online', () => void handleResume('online'))
    }

    async function sendPing() {
        if (!socket.value || socket.value.readyState !== WebSocket.OPEN) return

        // Ensure proto loaded
        const { EnvelopeType } = protoService
        const nowMs = monotonicNowMs()
        pruneStalePings(nowMs)
        if (ping.pendingSentAtMs !== null) return

        const pingBytes = protoService.encodePing()
        const envelopeBytes = protoService.encodeEnvelope(EnvelopeType.PING as number, pingBytes)
        const sent = sendEnvelope(envelopeBytes)
        if (!sent) return
        ping.pendingSentAtMs = nowMs

        if (ping.timeoutId) clearTimeout(ping.timeoutId)
        if (typeof window !== 'undefined') {
            ping.timeoutId = window.setTimeout(() => {
                ping.timeoutId = null
                ping.rttMs.value = null
            }, 15000)
        }
    }

    function startPingLoop() {
        if (typeof window === 'undefined') return
        stopPingLoop()
        ping.intervalId = window.setInterval(() => {
            void sendPing().catch((err) => {
                devError('[socket] ping failed', err)
            })
        }, PING_INTERVAL_MS)
        void sendPing().catch((err) => {
            devError('[socket] ping failed', err)
        })
    }

    async function sendReauth(token: string) {
        if (!socket.value || socket.value.readyState !== WebSocket.OPEN) return
        const { EnvelopeType } = protoService
        const authBytes = protoService.encodeAuthReauthRequest(token)
        const envelopeBytes = protoService.encodeEnvelope(EnvelopeType.AUTH as number, authBytes)

        sendEnvelope(envelopeBytes)
    }

    async function sendAuth(token: string) {
        if (!socket.value || socket.value.readyState !== WebSocket.OPEN) return
        const { EnvelopeType } = protoService
        const hasLocalVoiceTransport = hasDesiredVoiceTransport()
        const hubId = voiceSession.hubId || appStore.activeVoiceHubId || ''
        const channelId = voiceSession.channelId || appStore.activeVoiceChannelId || ''
        const resumeId = voiceSession.resumeId || ''
        const voiceResume =
            hasLocalVoiceTransport && hubId && channelId && resumeId
                ? {
                    hub_id: hubId,
                    channel_id: channelId,
                    resume_id: resumeId,
                }
                : undefined
        const authBytes = protoService.encodeAuthRequest(token, voiceResume)
        const envelopeBytes = protoService.encodeEnvelope(EnvelopeType.AUTH as number, authBytes)
        sendEnvelope(envelopeBytes)
    }

    async function sendInitialAuth() {
        try {
            const token = await resolveToken()
            await sendAuth(token)
        } catch (err) {
            clearAuthOkTimeout()
            devWarn('[socket] initial auth failed', err)
            if (socket.value) {
                try {
                    socket.value.close(4401, 'auth_failed')
                } catch {
                    socket.value.close()
                }
            }
        }
    }

    async function resolveToken(): Promise<string> {
        let authSession: AuthSession | null = auth.session
        if (!authSession) {
            authSession = await restoreServerSession()
        }

        if (!authSession) {
            devWarn('[socket] resolveToken no session available')
            forceLogout('no_session')
            throw new Error('No valid session')
        }

        const expiresAtMs = authSession.expires_at
            ? authSession.expires_at * 1000
            : null

        // Refresh if expiring within 10s
        if (!expiresAtMs || expiresAtMs <= Date.now() + 10_000) {
            const refreshedSession = await refreshServerSession()
            if (!refreshedSession) {
                forceLogout('token_refresh_invalid')
                throw new Error('Invalid refreshed session')
            }

            authSession = refreshedSession
        }

        auth.setSession(authSession)
        scheduleReauth(authSession)

        return authSession.access_token
    }

    function startBootstrapTimeout() {
        if (typeof window === 'undefined') return
        if (!authResolver) return
        if (authResolver.timeoutId !== null) return

        const resolver = authResolver
        authResolver.timeoutId = window.setTimeout(() => {
            devWarn('[socket] bootstrap timeout', {
                state: state.value,
                authState: authState.value
            })
            resolver.reject(new Error('Auth response timeout'))
            clearReconnectState()
            state.value = SocketState.IDLE
            authState.value = SocketAuthState.UNAUTHENTICATED
            lastClose.value = { code: 4408, reason: 'bootstrap_timeout' }
            if (socket.value) {
                try {
                    socket.value.close(4408, 'bootstrap_timeout')
                } catch {
                    socket.value.close()
                }
            }
        }, bootstrapTimeoutMs)
    }

    function waitForAuth(): Promise<void> {
        if (state.value === SocketState.READY) {
            return Promise.resolve()
        }
        if (authPromise) {
            return authPromise
        }
        authPromise = new Promise<void>((resolve, reject) => {
            if (typeof window === 'undefined') {
                authPromise = null
                reject(new Error('Auth wait requires browser context'))
                return
            }
                authResolver = {
                    resolve: () => {
                        const timeoutId = authResolver?.timeoutId
                        if (timeoutId !== null && timeoutId !== undefined) {
                            window.clearTimeout(timeoutId)
                        }
                        authPromise = null
                        authResolver = null
                        resolve()
                    },
                    reject: (err: Error) => {
                        const timeoutId = authResolver?.timeoutId
                        if (timeoutId !== null && timeoutId !== undefined) {
                            window.clearTimeout(timeoutId)
                        }
                        authPromise = null
                        authResolver = null
                        reject(err)
                },
                timeoutId: null
            }
        })

        return authPromise
    }

    function connect(options: ConnectOptions = {}): Promise<void> {
        const timeoutMs = options.timeoutMs ?? 8000
        bootstrapTimeoutMs = timeoutMs
        setupResumeListeners()
        if (!options.isReconnect) {
            reconnect.enabled = true
            resetReconnectAttempts()
        }

        // If already ready, resolve immediately
        if (state.value === SocketState.READY) {
            return Promise.resolve()
        }

        // If connection/auth is in progress, return the existing promise
        if (connectionPromise) {
            return connectionPromise
        }

        // Defensive: we are about to create a new socket and we are neither READY nor
        // mid-connect, so any socket still referenced here is stale. Detach its handlers
        // and close it so we never leave an orphaned connection open on the server.
        if (socket.value) {
            const stale = socket.value
            socket.value = null
            try {
                stale.onopen = null
                stale.onmessage = null
                stale.onerror = null
                stale.onclose = null
                stale.close(1000, 'superseded')
            } catch { /* ignore */ }
        }

        const wsUrl = resolveBrowserProxyUrl('/ws', 'socket')

        clearAuthOkTimeout()
        state.value = SocketState.CONNECTING
        authState.value = SocketAuthState.UNAUTHENTICATED

        connectionPromise = (async () => {
            try {
                const authReadyPromise = waitForAuth()
                devLog('[socket] connecting to', wsUrl)

                await new Promise<void>((resolve, reject) => {
                    let opened = false

                    try {
                        const wsCtor = WebSocket as unknown as {
                            new(
                                url: string,
                                protocols?: string[] | string
                            ): WebSocket
                        }
                        socket.value = new wsCtor(wsUrl)
                        socket.value.binaryType = 'arraybuffer'
                    } catch (err) {
                        state.value = SocketState.ERROR
                        authResolver?.reject(err as Error)
                        return reject(err as Error)
                    }

                    socket.value.onopen = () => {
                        opened = true
                        devLog('[socket] transport connected, sending explicit auth')
                        state.value = SocketState.CONNECTING
                        lastClose.value = null
                        clearReconnectState()
                        resetReconnectAttempts()
                        startAuthOkTimeout()
                        void sendInitialAuth()
                        resolve()
                    }

                    socket.value.onmessage = (event) => handleMessage(event, appStore)

                    socket.value.onclose = (evt) => {
                        devWarn('[socket] disconnected', {
                            code: evt.code,
                            reason: evt.reason,
                            state: state.value,
                            authState: authState.value
                        })
                        socket.value = null
                        stopPingLoop()
                        clearReauthTimer()
                        clearAuthOkTimeout()
                        clearReconnectState()

                        // Determine if this is an auth-related close (4400+).
                        // Two 4400+ codes are transient/recoverable, not real rejections:
                        // - 4408 bootstrap_timeout (client-initiated transient failure)
                        // - 4402 auth_token_expired: the token simply aged out; the reconnect
                        //   path refreshes it (resolveToken) and only logs out if the refresh
                        //   token itself is dead. Logging the user out here is wrong.
                        const authish = evt.code >= 4400
                        const isBootstrapTimeout = evt.code === 4408
                        const isTokenExpired = evt.code === 4402
                        const isRecoverable = !authish || isBootstrapTimeout || isTokenExpired

                        state.value = isRecoverable
                            ? (opened ? SocketState.IDLE : SocketState.ERROR)
                            : SocketState.ERROR
                        authState.value = SocketAuthState.UNAUTHENTICATED
                        clearAllPendingInitialActiveChannels()
                        lastClose.value = { code: evt.code, reason: evt.reason }
                        connectionPromise = null

                        if (authResolver) {
                            authResolver.reject(
                                new Error(`Socket closed before auth (code ${evt.code})`)
                            )
                        }
                        if (!opened) {
                            reject(new Error(`Socket closed before ready (code ${evt.code})`))
                        }

                        // Reconnect for all transient disconnects:
                        // - code < 4400: always reconnect (including 1006 with server reason)
                        // - code 4408 (bootstrap_timeout): reconnect — transient, not an auth rejection
                        // - other 4400+ codes: do not reconnect — server/client rejected auth
                        if (isRecoverable) {
                            scheduleReconnect(`close_${evt.code}`)
                        } else {
                            devWarn('[socket] auth error close, no reconnect:', evt.code, evt.reason)
                        }
                    }

                    socket.value.onerror = (e) => {
                        devError('[socket] error', e)
                        state.value = SocketState.ERROR
                        authState.value = SocketAuthState.UNAUTHENTICATED
                        socket.value = null
                        stopPingLoop()
                        clearReauthTimer()
                        clearAuthOkTimeout()
                        clearReconnectState()
                        connectionPromise = null
                        if (!lastClose.value) {
                            lastClose.value = { code: 0, reason: 'socket_error' }
                        }
                        if (authResolver) {
                            authResolver.reject(new Error('Socket error'))
                        }
                        reject(new Error('Socket error'))
                        // Don't auto-reconnect on error - let user decide
                    }
                })

                await authReadyPromise
                connectionPromise = null
            } catch (err) {
                connectionPromise = null
                throw err
            }
        })()

        return connectionPromise
    }

    function disconnect() {
        reconnect.enabled = false
        clearReconnectState()
        clearAuthOkTimeout()
        authState.value = SocketAuthState.UNAUTHENTICATED
        clearAllPendingInitialActiveChannels()
        voiceSession.resumeId = ''
        void disconnectVoice({ reason: 'disconnect' })
        if (!socket.value) return
        devLog('[socket] disconnecting')
        stopPingLoop()
        clearReauthTimer()
        socket.value.close()
    }

    function resolveHubIdForChannel(channelId: string): string | null {
        if (!channelId) return null
        if (appStore.activeHubId && appStore.activeChannelId === channelId) {
            return appStore.activeHubId
        }
        for (const [hubId, channels] of Object.entries(appStore.channelsByHub)) {
            if ((channels ?? []).some((channel) => channel.id === channelId)) {
                return hubId
            }
        }
        return null
    }

    async function sendRequestStateSync(hubIds: string[] = []) {
        if (state.value !== SocketState.READY || !socket.value) return
        const { EnvelopeType } = protoService
        const payload = protoService.encodeRequestStateSync(hubIds)
        const envelopeBytes = protoService.encodeEnvelope(
            EnvelopeType.REQUEST_STATE_SYNC as number,
            payload
        )
        sendEnvelope(envelopeBytes)
    }

    async function sendChatMessage(channelId: string, payloadInput: SendMessagePayload) {
        if (state.value !== SocketState.READY || !socket.value) {
            devWarn('[socket] sendChatMessage skipped, not ready')
            return
        }
        if (!channelId) {
            devWarn('[socket] sendChatMessage skipped, missing ids')
            return
        }
        const hubId = resolveHubIdForChannel(channelId)
        if (!hubId) {
            devWarn('[socket] sendChatMessage skipped, unknown channel context', channelId)
            await sendRequestStateSync()
            return
        }
        const trimmed = payloadInput.content.trim()
        const attachments = (payloadInput.attachments ?? [])
            .map((attachment) => ({
                id: attachment.id,
                kind: attachment.kind,
                storage_bucket: attachment.storageBucket,
                storage_key: attachment.storageKey,
                mime_type: attachment.mimeType,
                display_name: attachment.displayName,
                size_bytes: attachment.sizeBytes,
            }))
            .filter((attachment) => attachment.id && attachment.storage_key && attachment.storage_bucket)
        const linkPreview = payloadInput.linkPreview
            ? {
                url: payloadInput.linkPreview.url,
                title: payloadInput.linkPreview.title,
                description: payloadInput.linkPreview.description,
                site_name: payloadInput.linkPreview.siteName,
                image_url: payloadInput.linkPreview.imageUrl,
            }
            : undefined
        if (!trimmed && attachments.length === 0) return

        const { EnvelopeType } = protoService
        const payload = protoService.encodeSendMessage(
            hubId,
            channelId,
            trimmed,
            attachments,
            linkPreview
        )
        const envelopeBytes = protoService.encodeEnvelope(
            EnvelopeType.MESSAGE_SEND as number,
            payload
        )

        sendEnvelope(envelopeBytes)
    }

    async function createHub(name: string) {
        if (state.value !== SocketState.READY || !socket.value) {
            devWarn('[socket] createHub skipped, not ready')
            return
        }

        const trimmed = name.trim()
        if (!trimmed) return

        const { EnvelopeType } = protoService
        const payload = protoService.encodeCreateHub(trimmed)
        const envelopeBytes = protoService.encodeEnvelope(
            EnvelopeType.HUB_CREATE as number,
            payload
        )

        sendEnvelope(envelopeBytes)
    }

    async function validateHubInvite(joinCode: string) {
        const trimmed = joinCode.trim()
        if (!trimmed) return
        if (state.value !== SocketState.READY || !socket.value) {
            devWarn('[socket] validateHubInvite skipped, not ready')
            return
        }

        lastInvitePreview.value = null
        const { EnvelopeType } = protoService
        const payload = protoService.encodeValidateHubInvite(trimmed)
        const envelopeBytes = protoService.encodeEnvelope(
            EnvelopeType.HUB_INVITE_VALIDATE as number,
            payload
        )

        sendEnvelope(envelopeBytes)
    }

    async function joinHub(joinCode: string) {
        if (state.value !== SocketState.READY || !socket.value) {
            devWarn('[socket] joinHub skipped, not ready')
            return
        }

        const trimmed = joinCode.trim()
        if (!trimmed) return

        const { EnvelopeType } = protoService
        const payload = protoService.encodeJoinHub(trimmed)
        const envelopeBytes = protoService.encodeEnvelope(
            EnvelopeType.HUB_JOIN as number,
            payload
        )

        sendEnvelope(envelopeBytes)
    }

    async function createHubJoinCode(hubId: string) {
        if (state.value !== SocketState.READY || !socket.value) {
            devWarn('[socket] createHubJoinCode skipped, not ready')
            return
        }
        if (!hubId) return

        const { EnvelopeType } = protoService
        const payload = protoService.encodeCreateHubJoinCode(hubId)
        const envelopeBytes = protoService.encodeEnvelope(
            EnvelopeType.HUB_CREATE_JOIN_CODE as number,
            payload
        )

        sendEnvelope(envelopeBytes)
    }

    async function leaveHub(hubId: string) {
        if (state.value !== SocketState.READY || !socket.value) {
            devWarn('[socket] leaveHub skipped, not ready')
            return
        }
        if (!hubId) return

        const { EnvelopeType } = protoService
        const payload = protoService.encodeLeaveHub(hubId)
        const envelopeBytes = protoService.encodeEnvelope(
            EnvelopeType.HUB_LEAVE as number,
            payload
        )

        sendEnvelope(envelopeBytes)
    }

    async function removeHub(hubId: string) {
        if (state.value !== SocketState.READY || !socket.value) {
            devWarn('[socket] removeHub skipped, not ready')
            return
        }
        if (!hubId) return

        const { EnvelopeType } = protoService
        const payload = protoService.encodeRemoveHub(hubId)
        const envelopeBytes = protoService.encodeEnvelope(
            EnvelopeType.HUB_REMOVE as number,
            payload
        )

        sendEnvelope(envelopeBytes)
    }

    async function kickHubMember(hubId: string, userId: string) {
        if (state.value !== SocketState.READY || !socket.value) {
            devWarn('[socket] kickHubMember skipped, not ready')
            return
        }
        if (!hubId || !userId) return

        const { EnvelopeType } = protoService
        const payload = protoService.encodeKickHubMember(hubId, userId)
        const envelopeBytes = protoService.encodeEnvelope(
            EnvelopeType.HUB_MEMBER_KICK as number,
            payload
        )

        sendEnvelope(envelopeBytes)
    }

    async function updateHubSettings(
        hubId: string,
        opts: { name?: string; avatar_seed?: string }
    ) {
        if (state.value !== SocketState.READY || !socket.value) {
            devWarn('[socket] updateHubSettings skipped, not ready')
            return
        }
        if (!hubId) return

        const { EnvelopeType } = protoService
        const payload = protoService.encodeUpdateHub(hubId, opts)
        const envelopeBytes = protoService.encodeEnvelope(
            EnvelopeType.HUB_UPDATE as number,
            payload
        )

        sendEnvelope(envelopeBytes)
    }

    async function updateHubMemberRole(hubId: string, userId: string, role: number) {
        if (state.value !== SocketState.READY || !socket.value) {
            devWarn('[socket] updateHubMemberRole skipped, not ready')
            return
        }
        if (!hubId || !userId) return

        const { EnvelopeType } = protoService
        const payload = protoService.encodeUpdateHubMemberRole(hubId, userId, role)
        const envelopeBytes = protoService.encodeEnvelope(
            EnvelopeType.HUB_MEMBER_ROLE_UPDATE as number,
            payload
        )

        sendEnvelope(envelopeBytes)
    }

    async function createChannel(hubId: string, name: string, type: number) {
        if (state.value !== SocketState.READY || !socket.value) {
            devWarn('[socket] createChannel skipped, not ready')
            return
        }
        if (!hubId || !name) return

        const { EnvelopeType } = protoService
        const payload = protoService.encodeCreateChannel(hubId, name, type)
        const envelopeBytes = protoService.encodeEnvelope(
            EnvelopeType.CHANNEL_CREATE as number,
            payload
        )

        sendEnvelope(envelopeBytes)
    }

    async function updateChannelSettings(channelId: string, opts: { name?: string }) {
        if (state.value !== SocketState.READY || !socket.value) {
            devWarn('[socket] updateChannelSettings skipped, not ready')
            return
        }
        if (!channelId) return
        const hubId = resolveHubIdForChannel(channelId)
        if (!hubId) {
            devWarn('[socket] updateChannelSettings skipped, unknown channel context', channelId)
            await sendRequestStateSync()
            return
        }

        const { EnvelopeType } = protoService
        const payload = protoService.encodeUpdateChannel(hubId, channelId, opts)
        const envelopeBytes = protoService.encodeEnvelope(
            EnvelopeType.CHANNEL_UPDATE as number,
            payload
        )

        sendEnvelope(envelopeBytes)
    }

    async function removeChannel(channelId: string) {
        if (state.value !== SocketState.READY || !socket.value) {
            devWarn('[socket] removeChannel skipped, not ready')
            return
        }
        if (!channelId) return
        const hubId = resolveHubIdForChannel(channelId)
        if (!hubId) {
            devWarn('[socket] removeChannel skipped, unknown channel context', channelId)
            await sendRequestStateSync()
            return
        }

        const { EnvelopeType } = protoService
        const payload = protoService.encodeRemoveChannel(hubId, channelId)
        const envelopeBytes = protoService.encodeEnvelope(
            EnvelopeType.CHANNEL_REMOVE as number,
            payload
        )

        sendEnvelope(envelopeBytes)
    }

    async function updateUserProfile(
        opts: { username?: string; avatar_seed?: string; display_name?: string }
    ) {
        if (state.value !== SocketState.READY || !socket.value) {
            devWarn('[socket] updateUserProfile skipped, not ready')
            return
        }

        const { EnvelopeType } = protoService
        const payload = protoService.encodeUpdateUser(opts)
        const envelopeBytes = protoService.encodeEnvelope(
            EnvelopeType.USER_UPDATE as number,
            payload
        )

        sendEnvelope(envelopeBytes)
    }

    async function sendTyping(hubId: string, channelId: string, isTyping: boolean) {
        if (state.value !== SocketState.READY || !socket.value) {
            devWarn('[socket] sendTyping skipped, not ready')
            return
        }
        if (!hubId || !channelId) {
            devWarn('[socket] sendTyping skipped, missing ids')
            return
        }

        const { EnvelopeType } = protoService
        const payload = protoService.encodeTyping(hubId, channelId, isTyping)
        const envelopeBytes = protoService.encodeEnvelope(
            EnvelopeType.TYPING as number,
            payload
        )

        sendEnvelope(envelopeBytes)
    }

    async function sendTypingStarted(hubId: string, channelId: string) {
        await sendTyping(hubId, channelId, true)
    }

    async function sendTypingStopped(hubId: string, channelId: string) {
        await sendTyping(hubId, channelId, false)
    }

    async function sendActiveChannel(hubId: string, channelId: string) {
        if (state.value !== SocketState.READY || !socket.value) {
            devWarn('[socket] sendActiveChannel skipped, not ready')
            return
        }
        if (!hubId || !channelId) {
            devWarn('[socket] sendActiveChannel skipped, missing ids')
            return
        }

        const hasInitialFetch = appStore.hasChannelInitialFetchCompleted(channelId)
        if (!hasInitialFetch) {
            appStore.startChannelInitialFetch(channelId)
            enqueueInitialActiveChannel(channelId)
        }
        const knownLatestCursor = hasInitialFetch
            ? (appStore.getLatestMessageCursor(channelId) ?? undefined)
            : undefined

        const { EnvelopeType } = protoService
        const payload = protoService.encodeSelectActiveChannel(
            hubId,
            channelId,
            MESSAGE_LIMIT,
            knownLatestCursor
        )
        const envelopeBytes = protoService.encodeEnvelope(
            EnvelopeType.ACTIVE_CHANNEL as number,
            payload
        )

        sendEnvelope(envelopeBytes)
    }

    async function requestVoiceTransition(options: RequestVoiceTransitionOptions = {}) {
        const requestedKind = options.kind
        const requestedHubId = (options.hubId ?? '').trim()
        const requestedChannelId = (options.channelId ?? '').trim()
        const leaveHubId = requestedHubId || voiceSession.hubId || appStore.activeVoiceHubId || ''
        const leaveChannelId =
            requestedChannelId || voiceSession.channelId || appStore.activeVoiceChannelId || ''

        if (requestedKind === VoiceTransitionKind.Leave) {
            if (!leaveHubId || !leaveChannelId) {
                devWarn('[voice] transition skipped, leave target missing', {
                    hubId: leaveHubId,
                    channelId: leaveChannelId,
                })
                return
            }

            if (voiceTransition) {
                try {
                    await voiceTransition
                } catch {
                    // ignore previous transition failures
                }
            }

            const from = toVoiceTarget(leaveHubId, leaveChannelId)
            const transition = startVoiceTransition(VoiceTransitionKind.Leave, from, null)
            updateVoiceTransitionPhase(transition.id, VoiceTransitionPhase.Leaving)
            appStore.removeSelfFromAllVoiceChannels()
            appStore.clearActiveVoiceChannel()

            const sessionId = voiceSession.id
            const transitionTask = finalizeVoiceLeave(sessionId, leaveHubId, leaveChannelId, true)
            voiceTransition = transitionTask
            try {
                await transitionTask
                completeVoiceTransition(transition.id, {
                    sessionId,
                    reason: 'leave_transition',
                })
            } finally {
                if (voiceTransition === transitionTask) {
                    voiceTransition = null
                }
            }
            return
        }

        if (state.value !== SocketState.READY || !socket.value) {
            devWarn('[voice] transition skipped, socket not ready', {
                kind: requestedKind ?? 'auto',
            })
            return
        }
        if (!requestedHubId || !requestedChannelId) {
            devWarn('[voice] transition skipped, join target missing', {
                kind: requestedKind ?? 'auto',
                hubId: requestedHubId,
                channelId: requestedChannelId,
            })
            return
        }
        if (isDuplicateInFlightVoiceJoin(voiceTransitionController.active, {
            hubId: requestedHubId,
            channelId: requestedChannelId,
        })) {
            devWarn('[voice] duplicate_join_suppressed', {
                transitionId: voiceTransitionController.active?.id,
                target: {
                    hubId: requestedHubId,
                    channelId: requestedChannelId,
                },
                source: options.source ?? 'unknown',
            })
            return
        }
        if (isVoiceJoinBlocked(options.force === true)) {
            devWarn('[voice] join blocked during revoke cooldown', {
                source: options.source ?? 'unknown',
                hubId: requestedHubId,
                channelId: requestedChannelId,
                revokedUntil: voiceSession.revokedUntil
            })
            return
        }

        // Safari can defer microphone prompts unless they are requested from the click gesture path.
        const hasMicrophonePermission = await ensureVoiceMicrophonePermissionOnUserGesture()
        if (!hasMicrophonePermission) {
            appStore.clearPendingVoiceTakeover()
            appStore.clearActiveVoiceChannel()
            return
        }

        if (voiceTransition) {
            try {
                await voiceTransition
            } catch {
                // ignore previous transition failures
            }
        }

        const from = toVoiceTarget(
            voiceSession.hubId || appStore.activeVoiceHubId || '',
            voiceSession.channelId || appStore.activeVoiceChannelId || ''
        )
        const to = toVoiceTarget(requestedHubId, requestedChannelId)
        const kind = resolveVoiceTransitionKind(requestedHubId, requestedChannelId, requestedKind)
        const transition = startVoiceTransition(kind, from, to)
        updateVoiceTransitionPhase(transition.id, VoiceTransitionPhase.Joining, {
            source: options.source ?? 'unknown',
        })

        voiceSession.id += 1
        voiceSession.hubId = requestedHubId
        voiceSession.channelId = requestedChannelId
        voiceSession.resumeId = ''
        voiceSession.leaveInFlight = false
        voiceSession.active = true
        voiceSession.revokedUntil = 0
        pendingVoiceMembership = null
        appStore.clearPendingVoiceTakeover()
        appStore.setActiveVoiceChannel(requestedHubId, requestedChannelId)
        updateVoiceTransitionPhase(transition.id, VoiceTransitionPhase.AwaitingToken)

        const sent = await sendJoinVoiceRequest(requestedHubId, requestedChannelId, {
            preferMuted: appStore.voiceMuted || appStore.voiceDeafened,
            preferDeafened: appStore.voiceDeafened,
        })
        if (!sent) {
            completeVoiceTransition(transition.id, {
                result: 'join_request_not_sent',
            })
        }
    }

    async function joinVoiceChannel(
        hubId: string,
        channelId: string,
        options: JoinVoiceOptions = {}
    ) {
        await requestVoiceTransition({
            kind: undefined,
            hubId,
            channelId,
            force: options.force,
            source: options.source,
        })
    }

    async function kickVoiceParticipant(hubId: string, channelId: string, userId: string) {
        if (state.value !== SocketState.READY || !socket.value) {
            devWarn('[socket] kickVoiceParticipant skipped, not ready')
            return
        }
        if (!hubId || !channelId || !userId) return

        const { EnvelopeType } = protoService
        const payload = protoService.encodeKickVoiceParticipant(hubId, channelId, userId)
        const envelopeBytes = protoService.encodeEnvelope(
            EnvelopeType.VOICE_KICK_PARTICIPANT as number,
            payload
        )

        sendEnvelope(envelopeBytes)
    }

    async function leaveVoiceChannel(hubId: string, channelId: string) {
        await requestVoiceTransition({
            kind: VoiceTransitionKind.Leave,
            hubId,
            channelId,
            source: 'leave_voice_channel',
        })
    }

    async function sendVoiceActivity(
        hubId: string,
        channelId: string,
        isMuted: boolean,
        isDeafened: boolean
    ) {
        if (appStore.voiceConnecting) {
            devWarn('[socket] voiceActivity skipped, voice is connecting')
            return
        }
        if (state.value !== SocketState.READY || !socket.value) {
            devWarn('[socket] voiceActivity skipped, not ready')
            return
        }
        if (!hubId || !channelId) {
            devWarn('[socket] voiceActivity skipped, missing ids')
            return
        }
        if (!appStore.voiceConnectedByThisSession) {
            devWarn('[socket] voiceActivity skipped, session is not voice owner')
            return
        }
        if (appStore.activeVoiceHubId !== hubId || appStore.activeVoiceChannelId !== channelId) {
            devWarn('[socket] voiceActivity skipped, target is not active owner channel')
            return
        }

        const { EnvelopeType } = protoService
        const payload = protoService.encodeVoiceChannelActivity(
            hubId,
            channelId,
            isMuted,
            isDeafened
        )
        const envelopeBytes = protoService.encodeEnvelope(
            EnvelopeType.VOICE_ACTIVITY as number,
            payload
        )

        sendEnvelope(envelopeBytes)
    }

    async function fetchMessagesBefore(channelId: string, beforeCursor: MessageCursor) {
        if (state.value !== SocketState.READY || !socket.value) return
        if (!channelId || !beforeCursor?.message_seq || beforeCursor.message_seq <= 0) return
        const hubId = resolveHubIdForChannel(channelId)
        if (!hubId) {
            devWarn('[socket] fetchMessagesBefore skipped, unknown channel context', channelId)
            await sendRequestStateSync()
            return
        }

        const { EnvelopeType } = protoService
        const payload = protoService.encodeFetchMessagesBefore(
            hubId,
            channelId,
            beforeCursor,
            MESSAGE_LIMIT
        )
        const envelopeBytes = protoService.encodeEnvelope(
            EnvelopeType.MESSAGE_FETCH_BEFORE as number,
            payload
        )

        sendEnvelope(envelopeBytes)
    }

    async function handleTextMessage(data: string, appStoreInner: any) {
        devWarn('[socket] unexpected text message')
    }

    async function handleBinaryMessage(data: ArrayBuffer, appStoreInner: any, receivedAtMs?: number) {
        // Ensure proto loaded (cached after first call)
        const { EnvelopeType } = protoService
        const emptyPayloadTypes = new Set<number>([
            EnvelopeType.PONG as number,
            EnvelopeType.AUTH_OK as number,
            EnvelopeType.VOICE_SELF_STATUS as number,
            EnvelopeType.VOICE_SELF_REVOKED as number,
        ])
        // Decode envelope (SYNC, takes Uint8Array)
        const env = protoService.decodeEnvelope(new Uint8Array(data))

        if (env.type === EnvelopeType.AUTH) {
            // AUTH may be sent by some transport paths; only drive bootstrap flow
            // during initial connect, never during an already-ready session.
            authState.value = SocketAuthState.AUTHENTICATED
            clearAuthOkTimeout()
            if (state.value !== SocketState.READY) {
                state.value = SocketState.LOADING
                startBootstrapTimeout()
            }
            return
        }

        if (!env.payload && !emptyPayloadTypes.has(env.type)) {
            devWarn('[socket] envelope missing payload', env.type)
            return
        }

        switch (env.type) {
            case EnvelopeType.PONG: {
                protoService.decodePong(env.payload ?? new Uint8Array())
                if (ping.pendingSentAtMs === null) return
                const nowMs = receivedAtMs ?? monotonicNowMs()
                const rttMs = nowMs - ping.pendingSentAtMs
                ping.pendingSentAtMs = null
                if (ping.timeoutId) {
                    clearTimeout(ping.timeoutId)
                    ping.timeoutId = null
                }
                observePingSample(rttMs)
                return
            }
            case EnvelopeType.AUTH_OK: {
                authState.value = SocketAuthState.AUTHENTICATED
                clearAuthOkTimeout()
                protoService.decodeAuthOk(env.payload)
                if (state.value === SocketState.READY) {
                    devLog('[socket] AUTH_OK received (reauth)', {
                        state: state.value,
                        authState: authState.value
                    })
                    return
                }
                devLog('[socket] AUTH_OK received, waiting for state sync', {
                    state: state.value,
                    authState: authState.value
                })
                state.value = SocketState.LOADING
                startBootstrapTimeout()
                return
            }
            case EnvelopeType.STATE_SYNC: {
                clearAuthOkTimeout()
                const sync = protoService.decodeStateSync(env.payload ?? new Uint8Array())

                if (state.value === SocketState.READY) {
                    appStore.mergeStateSync(sync)
                    return
                }

                appStore.hydrateFromStateSync(sync)

                startPingLoop()
                authState.value = SocketAuthState.AUTHENTICATED
                authResolver?.resolve()
                state.value = SocketState.READY
                void flushPendingVoiceMembership()

                if (appStore.activeHubId && appStore.activeChannelId) {
                    void sendActiveChannel(appStore.activeHubId, appStore.activeChannelId)
                }
                return
            }
            case EnvelopeType.CommandError: {
                const err = protoService.decodeCommandError(env.payload ?? new Uint8Array())
                const code = err.code ?? 0
                const message = err.message ?? 'Komut başarısız'
                if (err.command_type === EnvelopeType.AUTH) {
                    devWarn('[socket] auth failed', {
                        code,
                        message,
                        state: state.value,
                        authState: authState.value
                    })
                    clearAuthOkTimeout()
                    authState.value = SocketAuthState.UNAUTHENTICATED
                    authResolver?.reject(new Error(message))
                    appStore.setCommandError(err.command_type ?? 0, code, message)
                } else {
                    if (err.command_type === EnvelopeType.ACTIVE_CHANNEL) {
                        const pendingChannelIds = takeAllPendingInitialActiveChannels()
                        for (const pendingChannelId of pendingChannelIds) {
                            appStore.completeChannelInitialFetch(pendingChannelId)
                        }
                    }
                    if (err.command_type === EnvelopeType.VOICE_JOIN &&
                        isJoinLikeTransition(voiceTransitionController.active)) {
                        const activeTransition = voiceTransitionController.active
                        const displayMessage = message === 'voice_rekey_in_progress'
                            ? 'Ses yeniden anahtarlama sürüyor, birkaç saniye sonra tekrar dene'
                            : message
                        await releaseLocalVoiceTransportFromServerStatus(
                            'voice_join_command_error',
                            false
                        )
                        appStore.setVoiceConnected(false)
                        appStore.setVoiceConnectedByThisSession(false)
                        appStore.setVoiceError(displayMessage)
                        resetLocalVoiceSessionState(true)
                        if (activeTransition) {
                            completeVoiceTransition(activeTransition.id, {
                                reason: 'voice_join_command_error',
                                code,
                                message,
                            })
                        }
                    }
                    appStore.setCommandError(err.command_type ?? 0, code, message)
                    devWarn(
                        '[socket] command error',
                        err.command_type,
                        code,
                        message
                    )
                }
                return
            }
            case EnvelopeType.VOICE_SELF_STATUS: {
                const status = protoService.decodeVoiceSelfStatus(env.payload ?? new Uint8Array())
                const connected = status.connected === true
                const isOwner = status.is_owner === true
                const statusHubId = status.channel?.hub_id ?? ''
                const statusChannelId = status.channel?.channel_id ?? ''
                const resumeId = status.resume_id ?? ''
                const activeTransition = voiceTransitionController.active
                const transitionTargetsStatus =
                    Boolean(activeTransition?.to) &&
                    activeTransition?.to?.hubId === statusHubId &&
                    activeTransition?.to?.channelId === statusChannelId
                if (connected && isOwner) {
                    if (resumeId) {
                        voiceSession.resumeId = resumeId
                    }
                } else {
                    voiceSession.resumeId = ''
                }
                appStore.applyVoiceSelfStatus({
                    connected,
                    is_owner: isOwner,
                    hub_id: statusHubId,
                    channel_id: statusChannelId,
                })
                if (!connected) {
                    const preserveJoinIntent =
                        isJoinLikeTransition(activeTransition) &&
                        !voiceSession.leaveInFlight
                    if (preserveJoinIntent && activeTransition) {
                        updateVoiceTransitionPhase(activeTransition.id, VoiceTransitionPhase.AwaitingStatus, {
                            reason: 'intermediate_disconnect_during_join_like_transition',
                        })
                        devLog('[voice] stale_event_ignored', {
                            type: 'voice_self_status_disconnected',
                            reason: 'intermediate_disconnect_during_join_like_transition',
                            transitionId: activeTransition.id,
                            transitionKind: activeTransition.kind,
                            statusHubId,
                            statusChannelId,
                        })
                    } else {
                        if (activeTransition?.kind === VoiceTransitionKind.Leave) {
                            updateVoiceTransitionPhase(activeTransition.id, VoiceTransitionPhase.Leaving, {
                                reason: 'server_leave_confirmation',
                            })
                        } else if (activeTransition?.kind !== VoiceTransitionKind.KickRecovery) {
                            const recoveryTransition = startVoiceTransition(
                                VoiceTransitionKind.KickRecovery,
                                toVoiceTarget(
                                    voiceSession.hubId || appStore.activeVoiceHubId || '',
                                    voiceSession.channelId || appStore.activeVoiceChannelId || ''
                                ),
                                null
                            )
                            updateVoiceTransitionPhase(
                                recoveryTransition.id,
                                VoiceTransitionPhase.Leaving,
                                {
                                    reason: 'server_disconnected_cleanup',
                                }
                            )
                        }
                        appStore.removeSelfFromAllVoiceChannels()
                        appStore.clearActiveVoiceChannel()
                    }
                    await releaseLocalVoiceTransportFromServerStatus(
                        'voice_self_status_disconnected',
                        preserveJoinIntent
                    )
                    const recoveryTransition = voiceTransitionController.active
                    if (recoveryTransition?.kind === VoiceTransitionKind.KickRecovery) {
                        completeVoiceTransition(recoveryTransition.id, {
                            reason: 'server_disconnected_cleanup_complete',
                        })
                    }
                } else if (!isOwner) {
                    await releaseLocalVoiceTransportFromServerStatus(
                        'voice_self_status_owner_lost',
                        false
                    )
                } else if (activeTransition && transitionTargetsStatus &&
                    isJoinLikeTransition(activeTransition)) {
                    updateVoiceTransitionPhase(activeTransition.id, VoiceTransitionPhase.AwaitingStatus, {
                        connected,
                        isOwner,
                    })
                    completeVoiceTransition(activeTransition.id, {
                        connected,
                        isOwner,
                        hubId: statusHubId,
                        channelId: statusChannelId,
                    })
                } else if (activeTransition && isJoinLikeTransition(activeTransition)) {
                    devLog('[voice] stale_event_ignored', {
                        type: 'voice_self_status_connected_non_target_channel',
                        transitionId: activeTransition.id,
                        transitionKind: activeTransition.kind,
                        statusHubId,
                        statusChannelId,
                        transitionTarget: activeTransition.to,
                    })
                }
                devLog('[voice] voice_self_status_applied', {
                    tabInstanceId: voiceTabInstanceId,
                    connected,
                    isOwner,
                    hubId: statusHubId,
                    channelId: statusChannelId,
                    hasResumeId: Boolean(resumeId),
                })
                return
            }
            case EnvelopeType.VOICE_SELF_REVOKED: {
                const revoked = protoService.decodeVoiceSelfRevoked(env.payload ?? new Uint8Array())
                await handleVoiceSelfRevoked(revoked)
                return
            }
            case EnvelopeType.STATE_DELTA: {
                const delta = protoService.decodeStateDelta(env.payload ?? new Uint8Array())
                for (const hubDelta of delta.hubs ?? []) {
                    for (const channelDelta of hubDelta.channels ?? []) {
                        const channelId = channelDelta.channel_id ?? ''
                        if (!channelId) continue
                        const hasLatestBatch = (channelDelta.message_ops ?? []).some(
                            (messageOp) => (messageOp.batch?.direction ?? 0) === 1
                        )
                        if (hasLatestBatch) {
                            clearInitialActiveChannel(channelId)
                        }
                    }
                }
                const missingHubIds = appStore.applyStateDelta(delta)
                if (missingHubIds.length > 0) {
                    await sendRequestStateSync(Array.from(new Set(missingHubIds)))
                }
                return
            }
            case EnvelopeType.HUB_INVITE_VALIDATE: {
                // Server confirmed the invite is valid and returned a hub preview.
                const hub = protoService.decodeHubInvitePreview(env.payload ?? new Uint8Array())
                const hubId = hub.id ?? ''
                if (!hubId) return
                lastInvitePreview.value = {
                    hubId,
                    hubName: hub.name ?? '',
                    avatarSeed: hub.metadata?.avatar_seed ?? '',
                }
                return
            }
            case EnvelopeType.RT_SIGNAL: {
                const signal = protoService.decodeRtSignal(env.payload ?? new Uint8Array())
                appStore.applyRtSignal(signal)
                return
            }
            case EnvelopeType.VOICE_TOKEN_ISSUED: {
                const issued = protoService.decodeVoiceTokenIssued(env.payload ?? new Uint8Array())
                if (issued.resume_id) {
                    voiceSession.resumeId = issued.resume_id
                }

                if (!voiceSession.active || !voiceSession.channelId) {
                    devWarn('[voice] token ignored — no active voice session', {
                        tabInstanceId: voiceTabInstanceId,
                        active: voiceSession.active,
                        voiceSessionChannelId: voiceSession.channelId,
                        voiceSessionHubId: voiceSession.hubId,
                        activeVoiceChannelId: appStore.activeVoiceChannelId
                    })
                    return
                }

                if (appStore.activeVoiceHubId !== voiceSession.hubId ||
                    appStore.activeVoiceChannelId !== voiceSession.channelId) {
                    appStore.setActiveVoiceChannel(voiceSession.hubId, voiceSession.channelId)
                }

                const activeTransition = voiceTransitionController.active
                if (activeTransition && isJoinLikeTransition(activeTransition)) {
                    updateVoiceTransitionPhase(activeTransition.id, VoiceTransitionPhase.AwaitingStatus, {
                        reason: 'voice_token_issued',
                    })
                }

                if (isVoiceJoinBlocked(false)) {
                    devWarn('[voice] accepting token during revoke cooldown for active session', {
                        tabInstanceId: voiceTabInstanceId,
                        revokedUntil: voiceSession.revokedUntil
                    })
                }

                void connectVoice(
                    issued.token,
                    voiceSession.id,
                    voiceSession.hubId,
                    voiceSession.channelId,
                    issued.e2ee_key,
                    issued.livekit_url,
                    issued.key_index
                )
                devLog('[voice] token issued', {
                    tabInstanceId: voiceTabInstanceId,
                    tokenLength: issued.token?.length ?? 0,
                    hasLivekitUrl: Boolean(issued.livekit_url),
                    livekitUrlHost: issued.livekit_url ?? '',
                    sessionId: voiceSession.id,
                    hubId: voiceSession.hubId,
                    channelId: voiceSession.channelId,
                    hasResumeId: Boolean(issued.resume_id),
                })
                return
            }
            case EnvelopeType.VOICE_KEY_UPDATE: {
                const update = protoService.decodeVoiceKeyUpdate(env.payload ?? new Uint8Array())
                const updHubId = update.channel?.hub_id ?? ''
                const updChannelId = update.channel?.channel_id ?? ''
                // Only apply to our active voice session's channel.
                if (!voiceSession.active ||
                    updHubId !== voiceSession.hubId ||
                    updChannelId !== voiceSession.channelId) {
                    return
                }
                if (!update.e2ee_key) return
                void livekitRotateVoiceKey(update.e2ee_key, update.key_index ?? 0)
                devLog('[voice] e2ee key rotated', { keyIndex: update.key_index ?? 0 })
                return
            }
            default:
                devLog('[socket] unhandled envelope type', env.type)
        }
    }


    function handleMessage(event: MessageEvent, appStoreInner: any) {
        const receivedAtMs = monotonicNowMs()
        // -----------------------------
        // Binary (protobuf)
        // -----------------------------
        if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
            const binaryPromise =
                event.data instanceof Blob
                    ? event.data.arrayBuffer()
                    : Promise.resolve(event.data)

            void binaryPromise
                .then((buf) => handleBinaryMessage(buf, appStoreInner, receivedAtMs))
                .catch((err) => {
                    devError('[socket] binary message error', err)
                })

            return
        }

        // -----------------------------
        // Text (JSON)
        // -----------------------------
        if (typeof event.data === 'string') {
            handleTextMessage(event.data, appStoreInner)
        }
    }

    return {
        connect,
        disconnect,
        sendChatMessage,
        createHub,
        joinHub,
        validateHubInvite,
        lastInvitePreview,
        createHubJoinCode,
        leaveHub,
        removeHub,
        kickHubMember,
        updateHubSettings,
        updateHubMemberRole,
        createChannel,
        updateChannelSettings,
        removeChannel,
        updateUserProfile,
        sendTyping,
        sendTypingStarted,
        sendTypingStopped,
        sendActiveChannel,
        requestVoiceTransition,
        joinVoiceChannel,
        kickVoiceParticipant,
        confirmVoiceTakeover,
        cancelVoiceTakeover,
        leaveVoiceChannel,
        sendVoiceActivity,
        fetchMessagesBefore,
        requestStateSync: sendRequestStateSync,
        state,
        authState,
        pingMs: ping.rttMs,
        connected,
        lastClose,
        reconnectIn: reconnect.inSeconds
    }
}
