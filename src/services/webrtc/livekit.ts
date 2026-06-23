import {
    Room,
    ConnectionState as LiveKitConnectionState,
    DisconnectReason,
    DefaultReconnectPolicy,
    createLocalAudioTrack,
    createLocalVideoTrack,
    createLocalScreenTracks,
    LocalAudioTrack,
    LocalVideoTrack,
    Track,
    VideoPresets,
    ScreenSharePresets,
} from "livekit-client";
import type { Participant, LocalTrack } from "livekit-client";
import { useAppStore } from "~/stores/app";
import {
    coercePreferredVoiceDeviceId,
    getPreferredVoiceDeviceId,
    listVoiceAudioDevices,
    supportsSpeakerSelection,
    getPreferredCameraDeviceId,
    setPreferredCameraDeviceId,
    getCameraQualityPreset,
    getScreenShareQualityPreset,
    VIDEO_QUALITY_PRESETS,
    type VideoQualityPreset,
} from "@/src/services/webrtc/devices";
import { createVoiceInputHandler, KRISP_ENABLED, NoiseCancellationMethod } from "@/src/services/webrtc/inputHandler";
import { createVoiceOutputHandler } from "@/src/services/webrtc/outputHandler";
import { createVoiceControls } from "@/src/services/webrtc/controls";
import {
    attachRoomEvents,
    detachRoomEvents,
    type RoomEventHandlers,
} from "@/src/services/webrtc/roomEvents";
import {
    describeVoiceConnectError,
    describeVoiceDisconnectReason,
    describeVoiceEncryptionError,
    isUnrecoverableDisconnect,
    isUnrecoverableError,
    userFacingVoiceConnectError,
    userFacingVoiceEncryptionError,
} from "@/src/services/webrtc/errors";
import { applyE2EEKey, resetE2EEKeyProvider, setupE2EE } from "@/src/services/webrtc/e2ee";
import { startLatencyPolling, stopLatencyPolling } from "@/src/services/webrtc/latency";
import {
    resetSpeakingUsers,
    syncSpeakingUsersFromParticipants,
} from "@/src/services/webrtc/speaking";
import {
    getVoiceProcessingSettings,
    isLocallyDeafened,
    isLocallyMuted,
    setVoiceError,
} from "@/src/services/webrtc/storeHelpers";
import {
    playJoinSound,
    playLeaveSound,
    playScreenShareStartSound,
    playScreenShareStopSound,
} from "@/src/services/webrtc/sounds";
// Removed resolveLivekitConnectUrlForAttempt, use livekitUrl from proto data directly
import {
    withTimeout,
} from "@/src/services/webrtc/utils";
import { applyKrispToTrack, destroyKrisp } from "@/src/services/webrtc/krispProcessor";
import { devError, devLog, devWarn } from "@/src/utils/safeLogger";

/**
 * Voice connection lifecycle and exported control surface for LiveKit rooms.
 *
 * Manages a single Room instance, relies on LiveKit's reconnect policy, and coordinates
 * input/output, speaking, latency, E2EE, and teardown helpers.
 *
 * Used by: composables/useWebSocket.ts and the voice settings UI.
 */
/** Options passed to connectVoice() for one voice session. */
type VoiceConnectOptions = {
    sessionId: number;
    livekitUrl: string;
    e2eeKey?: string;
    e2eeKeyIndex?: number;
    onJoined: () => void | Promise<void>;
    onPermanentDisconnect: (details?: VoiceDisconnectDetails) => void | Promise<void>;
    onRecoverableDisconnect?: (details: VoiceDisconnectDetails) => void | Promise<void>;
    onEncryptionError?: () => void | Promise<void>;
};
type VoiceDisconnectDetails = {
    reason: string;
    recoverable: boolean;
    reconnectReasonCount: number;
};
/** Mutable voice connection state kept at module scope for the active session. */
type ConnectionState = {
    room: Room | null;
    audioTrack: LocalAudioTrack | null;
    videoTrack: LocalVideoTrack | null;
    screenTrack: LocalVideoTrack | null;
    screenAudioTrack: LocalTrack | null;
    screenTrackEndedListener: (() => void) | null;
    desired: boolean;
    sessionId: number;
    token: string;
    options: VoiceConnectOptions | null;
    loopRunning: boolean;
    joinNotified: boolean;
};
// --- Connection timing and LiveKit retry limits ---
const TRACK_PUBLISH_TIMEOUT_MS = 8000;
const INITIAL_CONNECT_RETRIES = 3;
const MAX_ADDITIONAL_SIMULCAST_LAYERS = 2;
// Keep recovery snappy for voice UX: 120/240/360ms retry cadence (max ~720ms total).
const SUBSCRIPTION_RETRY_BASE_DELAY_MS = 120;
const SUBSCRIPTION_RETRY_MAX_ATTEMPTS = 3;
// Grace before an encryption error escalates to a full voice transition (drop + rejoin).
// During a key rotation a remote frame can arrive stamped with the new key index a moment
// before this client receives the matching VOICE_KEY_UPDATE, which LiveKit surfaces as a
// (throttled) EncryptionError. The keyring keeps decrypting once the key lands, so these
// are transient and self-heal — we only escalate if errors persist with no key arriving.
const ENCRYPTION_ERROR_GRACE_MS = 4000;
const state: ConnectionState = {
    room: null,
    audioTrack: null,
    videoTrack: null,
    screenTrack: null,
    screenAudioTrack: null,
    screenTrackEndedListener: null,
    desired: false,
    sessionId: 0,
    token: "",
    options: null,
    loopRunning: false,
    joinNotified: false,
};

type TrackPublicationLike = {
    kind?: Track.Kind;
    source?: Track.Source;
    trackSid?: string;
    isSubscribed?: boolean;
    setSubscribed?: (subscribed: boolean) => void;
};

const voiceMetrics = {
    autoplayBlockedCount: 0,
    autoplayUnlockedCount: 0,
    screenOptInAttempts: 0,
    screenOptInSubscribeCount: 0,
    reconnectReasonCount: new Map<string, number>(),
};

const screenOptInStartedAtByTrackKey = new Map<string, number>();
let autoplayUnlockBlocked = false;
// Pending escalation from a transient EncryptionError to a full voice transition. Cleared
// when a key is applied (the missing key likely just arrived) or on teardown/reconnect.
let encryptionEscalationTimer: ReturnType<typeof setTimeout> | null = null;

function clearEncryptionEscalation(): void {
    if (encryptionEscalationTimer) {
        clearTimeout(encryptionEscalationTimer);
        encryptionEscalationTimer = null;
    }
}

function withAppStore(callback: (app: ReturnType<typeof useAppStore>) => void): void {
    try {
        callback(useAppStore());
    } catch {
        // ignore store sync failures during teardown
    }
}

function trackKey(identity: string, trackSid: string): string {
    return `${identity}:${trackSid}`;
}

function rememberScreenOptInAttempt(identity: string, trackSids: string[]): void {
    if (!identity) return;
    const startedAt = Date.now();
    trackSids.forEach((trackSid) => {
        if (!trackSid) return;
        screenOptInStartedAtByTrackKey.set(trackKey(identity, trackSid), startedAt);
    });
}

function finalizeScreenOptInLatency(identity: string, trackSid: string): void {
    if (!identity || !trackSid) return;
    const key = trackKey(identity, trackSid);
    const startedAt = screenOptInStartedAtByTrackKey.get(key);
    if (!startedAt) return;
    screenOptInStartedAtByTrackKey.delete(key);
    voiceMetrics.screenOptInSubscribeCount += 1;
    devLog("[voice] screen opt-in subscribed", {
        identity,
        trackSid,
        latencyMs: Date.now() - startedAt,
    });
}

function recordReconnectReason(reason?: DisconnectReason): void {
    const key = String(reason ?? "unknown");
    const current = voiceMetrics.reconnectReasonCount.get(key) ?? 0;
    voiceMetrics.reconnectReasonCount.set(key, current + 1);
}

function updateAutoplayUnlockState(blocked: boolean): void {
    if (autoplayUnlockBlocked === blocked) {
        withAppStore((app) => {
            app.setVoiceNeedsAudioUnlock(blocked);
        });
        return;
    }

    autoplayUnlockBlocked = blocked;
    if (blocked) {
        voiceMetrics.autoplayBlockedCount += 1;
    } else {
        voiceMetrics.autoplayUnlockedCount += 1;
    }
    withAppStore((app) => {
        app.setVoiceNeedsAudioUnlock(blocked);
    });
    devLog("[voice] autoplay status changed", {
        blocked,
        blockedCount: voiceMetrics.autoplayBlockedCount,
        unlockedCount: voiceMetrics.autoplayUnlockedCount,
    });
}

const voiceInputHandler = createVoiceInputHandler({
    getTrack: () => state.audioTrack,
    getPreferredMicrophoneDeviceId: () => getPreferredVoiceDeviceId("audioinput"),
    warn: (message, error) => devWarn(message, error),
});
const voiceOutputHandler = createVoiceOutputHandler({
    warn: (message, error) => devWarn(message, error),
});
const controls = createVoiceControls({
    getRoom: () => state.room,
    getAudioTrack: () => state.audioTrack,
    setAudioTrack: (track) => {
        state.audioTrack = track;
    },
    voiceInputHandler,
    voiceOutputHandler,
    isLocallyMuted,
    getVoiceProcessingSettings,
    warn: (message, error) => devWarn(message, error),
});
function isDesiredSession(sessionId: number) {
    return state.desired && state.sessionId === sessionId;
}

function clearConnectionIntent() {
    state.desired = false;
    state.sessionId = 0;
    state.token = "";
    state.options = null;
    state.joinNotified = false;
}

function setLocalScreenShareStoreState(enabled: boolean): void {
    withAppStore((app) => {
        app.localScreenShareEnabled = enabled

        if (!enabled) {
            app.screenShareAudioMuted = false
        }

        if (app.userId) {
            app.setUserScreenSharing(app.userId, enabled)
        }
    })
}

function syncLocalVisualMediaStoreStateReleased(): void {
    withAppStore((app) => {
        app.localCameraEnabled = false
        app.localScreenShareEnabled = false
        app.screenShareAudioMuted = false

        if (app.userId) {
            app.setUserScreenSharing(app.userId, false)
        }
    })
}

function detachScreenTrackEndedListener(track?: LocalVideoTrack | null): void {
    const targetTrack = track ?? state.screenTrack;
    const listener = state.screenTrackEndedListener;
    if (targetTrack && listener) {
        try {
            targetTrack.mediaStreamTrack.removeEventListener("ended", listener);
        } catch {
            // ignore remove listener failures
        }
    }
    state.screenTrackEndedListener = null;
}

function releaseLocalVisualMediaTracks(): void {
    if (state.videoTrack) {
        state.videoTrack.stop();
        state.videoTrack = null;
    }

    if (state.screenTrack) {
        detachScreenTrackEndedListener(state.screenTrack);
        state.screenTrack.stop();
        state.screenTrack = null;
    } else {
        detachScreenTrackEndedListener(null);
    }

    if (state.screenAudioTrack) {
        state.screenAudioTrack.stop();
        state.screenAudioTrack = null;
    }

    syncLocalVisualMediaStoreStateReleased();
}

function releaseConnectionResources(
    targetRoom: Room | null,
    localTrack: LocalAudioTrack | null,
) {
    if (localTrack) {
        controls.detachTrackMedia(localTrack);
        localTrack.stop();
    }
    controls.detachRemoteAudioTracks(targetRoom);
    detachRoomEvents(targetRoom);
    stopLatencyPolling();
    voiceOutputHandler.reset();
    voiceInputHandler.destroy();
    resetSpeakingUsers();
    releaseLocalVisualMediaTracks();
    state.room = null;
    state.audioTrack = null;
    clearEncryptionEscalation();
    resetE2EEKeyProvider();
    void destroyKrisp();
    screenMediaAllowedByIdentity.clear();
    cameraAllowedByIdentity.clear();
    screenOptInStartedAtByTrackKey.clear();
    updateAutoplayUnlockState(false);
    withAppStore((app) => {
        app.clearScreenSharingUsers();
    });
}

// Track-level allowlist for explicitly opted-in remote screen media (video + audio), keyed by participant identity.
const screenMediaAllowedByIdentity = new Map<string, Set<string>>();

// Track-level allowlist for explicitly opted-in remote camera video, keyed by participant identity.
// Remote camera is opt-in: a participant may publish camera (availability) without this client
// subscribing/downloading it until the user explicitly chooses to watch.
const cameraAllowedByIdentity = new Map<string, Set<string>>();

function syncScreenSharingUsersFromRoom(targetRoom: Room | null): void {
    withAppStore((app) => {
        app.clearScreenSharingUsers()

        if (!targetRoom) return

        const localIdentity = targetRoom.localParticipant.identity?.trim() ?? app.userId ?? ''
        const localScreenPub = targetRoom.localParticipant.getTrackPublication(Track.Source.ScreenShare)
        if (localIdentity && localScreenPub) {
            app.setUserScreenSharing(localIdentity, true)
        }

        targetRoom.remoteParticipants.forEach((participant) => {
            const identity = participant.identity?.trim() ?? ''
            if (!identity) return

            const screenPub = participant.getTrackPublication(Track.Source.ScreenShare)
            if (screenPub) {
                app.setUserScreenSharing(identity, true)
            }
        })
    })
}

function normalizeIdentity(identity: string): string {
    return identity.trim();
}

function normalizeTrackSid(trackSid: string | null | undefined): string {
    return trackSid?.trim() ?? "";
}

function clearScreenMediaAllowance(identity: string): void {
    const normalizedIdentity = normalizeIdentity(identity);
    if (!normalizedIdentity) return;
    screenMediaAllowedByIdentity.delete(normalizedIdentity);
    const prefix = `${normalizedIdentity}:`;
    Array.from(screenOptInStartedAtByTrackKey.keys()).forEach((key) => {
        if (key.startsWith(prefix)) {
            screenOptInStartedAtByTrackKey.delete(key);
        }
    });
}

function isScreenMediaAllowed(identity: string, trackSid: string): boolean {
    const normalizedIdentity = normalizeIdentity(identity);
    if (!normalizedIdentity) return false;
    const allowedTrackSids = screenMediaAllowedByIdentity.get(normalizedIdentity);
    if (!allowedTrackSids || allowedTrackSids.size === 0) return false;
    if (allowedTrackSids.has("*")) return true;
    const normalizedTrackSid = normalizeTrackSid(trackSid);
    if (!normalizedTrackSid) return false;
    return allowedTrackSids.has(normalizedTrackSid);
}

/**
 * Keep the existing exported API name for compatibility.
 * Internally this now controls both screen-share video and audio subscriptions.
 */
export function allowScreenShareAudio(identity: string, trackSids?: string | string[]) {
    const normalizedIdentity = normalizeIdentity(identity);
    if (!normalizedIdentity) return;

    const providedTrackSids = Array.isArray(trackSids)
        ? trackSids
        : (trackSids ? [trackSids] : []);
    const normalizedTrackSids = providedTrackSids
        .map((sid) => normalizeTrackSid(sid))
        .filter((sid) => sid.length > 0);

    if (normalizedTrackSids.length === 0) {
        // Backward-compat fallback if old callers pass identity only.
        screenMediaAllowedByIdentity.set(normalizedIdentity, new Set(["*"]));
        const room = state.room;
        if (room) {
            const participant = findRemoteParticipantByIdentity(room, normalizedIdentity);
            if (participant) {
                const activeScreenTrackSids = [
                    participant.getTrackPublication(Track.Source.ScreenShare)?.trackSid,
                    participant.getTrackPublication(Track.Source.ScreenShareAudio)?.trackSid,
                ]
                    .map((sid) => normalizeTrackSid(sid))
                    .filter((sid) => sid.length > 0);
                if (activeScreenTrackSids.length > 0) {
                    rememberScreenOptInAttempt(normalizedIdentity, activeScreenTrackSids);
                }
            }
        }
        voiceMetrics.screenOptInAttempts += 1;
        syncScreenMediaSubscriptionForIdentity(normalizedIdentity);
        return;
    }

    const current = screenMediaAllowedByIdentity.get(normalizedIdentity) ?? new Set<string>();
    current.clear();
    normalizedTrackSids.forEach((sid) => current.add(sid));
    screenMediaAllowedByIdentity.set(normalizedIdentity, current);
    rememberScreenOptInAttempt(normalizedIdentity, normalizedTrackSids);
    voiceMetrics.screenOptInAttempts += 1;
    syncScreenMediaSubscriptionForIdentity(normalizedIdentity);
    devLog("[voice] screen opt-in requested", {
        identity: normalizedIdentity,
        trackSids: normalizedTrackSids,
        attempts: voiceMetrics.screenOptInAttempts,
    });
}

export function disallowScreenShareAudio(identity: string) {
    const normalizedIdentity = normalizeIdentity(identity);
    clearScreenMediaAllowance(normalizedIdentity);
    if (!normalizedIdentity) return;
    syncScreenMediaSubscriptionForIdentity(normalizedIdentity);
}

export function isScreenShareAudioAllowed(identity: string, trackSids?: string | string[]): boolean {
    const normalizedIdentity = normalizeIdentity(identity);
    if (!normalizedIdentity) return false;
    const allowedTrackSids = screenMediaAllowedByIdentity.get(normalizedIdentity);
    if (!allowedTrackSids || allowedTrackSids.size === 0) return false;
    if (allowedTrackSids.has("*")) return true;

    const providedTrackSids = Array.isArray(trackSids)
        ? trackSids
        : (trackSids ? [trackSids] : []);
    const normalizedTrackSids = providedTrackSids
        .map((sid) => normalizeTrackSid(sid))
        .filter((sid) => sid.length > 0);

    if (normalizedTrackSids.length === 0) return false;
    return normalizedTrackSids.some((sid) => allowedTrackSids.has(sid));
}

// --- Remote camera opt-in allowlist (mirrors the screen-share allowlist) ---

function clearCameraAllowance(identity: string): void {
    const normalizedIdentity = normalizeIdentity(identity);
    if (!normalizedIdentity) return;
    cameraAllowedByIdentity.delete(normalizedIdentity);
}

function isCameraAllowed(identity: string, trackSid: string): boolean {
    const normalizedIdentity = normalizeIdentity(identity);
    if (!normalizedIdentity) return false;
    const allowedTrackSids = cameraAllowedByIdentity.get(normalizedIdentity);
    if (!allowedTrackSids || allowedTrackSids.size === 0) return false;
    if (allowedTrackSids.has("*")) return true;
    const normalizedTrackSid = normalizeTrackSid(trackSid);
    if (!normalizedTrackSid) return false;
    return allowedTrackSids.has(normalizedTrackSid);
}

function syncCameraSubscriptionForIdentity(identity: string): void {
    const room = state.room;
    if (!room) return;
    const participant = findRemoteParticipantByIdentity(room, identity);
    if (!participant) return;
    participant.trackPublications.forEach((publication) => {
        if (publication.source !== Track.Source.Camera) return;
        applyRemotePublicationSubscriptionPolicy(publication as unknown as TrackPublicationLike, participant);
    });
}

/**
 * Opt in to a remote participant's camera video. Only the named participant's
 * camera track is subscribed; nothing else is affected. When called without
 * trackSids, every active camera track for that identity is allowed.
 */
export function allowRemoteCamera(identity: string, trackSids?: string | string[]): void {
    const normalizedIdentity = normalizeIdentity(identity);
    if (!normalizedIdentity) return;

    const providedTrackSids = Array.isArray(trackSids)
        ? trackSids
        : (trackSids ? [trackSids] : []);
    const normalizedTrackSids = providedTrackSids
        .map((sid) => normalizeTrackSid(sid))
        .filter((sid) => sid.length > 0);

    if (normalizedTrackSids.length === 0) {
        cameraAllowedByIdentity.set(normalizedIdentity, new Set(["*"]));
    } else {
        const current = cameraAllowedByIdentity.get(normalizedIdentity) ?? new Set<string>();
        current.clear();
        normalizedTrackSids.forEach((sid) => current.add(sid));
        cameraAllowedByIdentity.set(normalizedIdentity, current);
    }
    syncCameraSubscriptionForIdentity(normalizedIdentity);
    devLog("[voice] remote camera opt-in requested", {
        identity: normalizedIdentity,
        trackSids: normalizedTrackSids,
    });
}

/** Stop watching a remote participant's camera: drop the allowance and unsubscribe. */
export function disallowRemoteCamera(identity: string): void {
    const normalizedIdentity = normalizeIdentity(identity);
    clearCameraAllowance(normalizedIdentity);
    if (!normalizedIdentity) return;
    syncCameraSubscriptionForIdentity(normalizedIdentity);
}

/** Whether this client is currently opted in to a remote participant's camera. */
export function isRemoteCameraAllowed(identity: string, trackSids?: string | string[]): boolean {
    const normalizedIdentity = normalizeIdentity(identity);
    if (!normalizedIdentity) return false;
    const allowedTrackSids = cameraAllowedByIdentity.get(normalizedIdentity);
    if (!allowedTrackSids || allowedTrackSids.size === 0) return false;
    if (allowedTrackSids.has("*")) return true;

    const providedTrackSids = Array.isArray(trackSids)
        ? trackSids
        : (trackSids ? [trackSids] : []);
    const normalizedTrackSids = providedTrackSids
        .map((sid) => normalizeTrackSid(sid))
        .filter((sid) => sid.length > 0);

    if (normalizedTrackSids.length === 0) return false;
    return normalizedTrackSids.some((sid) => allowedTrackSids.has(sid));
}

function findRemoteParticipantByIdentity(targetRoom: Room, identity: string): Participant | null {
    const normalizedIdentity = normalizeIdentity(identity);
    if (!normalizedIdentity) return null;
    const direct = targetRoom.remoteParticipants.get(normalizedIdentity);
    if (direct) return direct as unknown as Participant;
    for (const participant of targetRoom.remoteParticipants.values()) {
        if ((participant.identity ?? "").trim() === normalizedIdentity) {
            return participant as unknown as Participant;
        }
    }
    return null;
}

function findRemotePublicationByTrackSid(
    participant: Participant,
    trackSid: string,
): TrackPublicationLike | null {
    const normalizedTrackSid = normalizeTrackSid(trackSid);
    if (!normalizedTrackSid) return null;
    const publications = participant.trackPublications;
    if (!publications || typeof publications.forEach !== "function") return null;
    let found: TrackPublicationLike | null = null;
    publications.forEach((publication) => {
        if (found) return;
        if (normalizeTrackSid(publication?.trackSid) !== normalizedTrackSid) return;
        found = publication as TrackPublicationLike;
    });
    return found;
}

function isScreenMediaSource(source?: Track.Source): boolean {
    return source === Track.Source.ScreenShare || source === Track.Source.ScreenShareAudio;
}

function isScreenMediaPublicationAllowed(
    publication: TrackPublicationLike,
    participant?: Participant,
): boolean {
    const source = publication.source;
    if (!isScreenMediaSource(source)) return true;

    const identity = participant?.identity?.trim() ?? "";
    const publicationTrackSid = publication.trackSid?.trim() ?? "";
    if (isScreenMediaAllowed(identity, publicationTrackSid)) return true;

    if (source === Track.Source.ScreenShareAudio) {
        const screenVideoTrackSid = participant
            ?.getTrackPublication?.(Track.Source.ScreenShare)
            ?.trackSid
            ?.trim() ?? "";
        return isScreenMediaAllowed(identity, screenVideoTrackSid);
    }
    return false;
}

// Exported for unit testing of the remote subscription policy. Not part of the
// public runtime surface — production callers use the internal helpers above.
export function shouldSubscribeToRemotePublication(
    publication: TrackPublicationLike,
    participant?: Participant,
): boolean {
    if (!participant || participant.isLocal) return false;
    if (publication.kind === Track.Kind.Video) {
        if (publication.source === Track.Source.ScreenShare) {
            return isScreenMediaPublicationAllowed(publication, participant);
        }
        if (publication.source === Track.Source.Camera) {
            // Remote camera is opt-in: subscribe only when the user explicitly
            // chose to watch this participant's camera. Opening the grid does not
            // grant a subscription on its own.
            const identity = participant.identity?.trim() ?? "";
            const publicationTrackSid = publication.trackSid?.trim() ?? "";
            return isCameraAllowed(identity, publicationTrackSid);
        }
        return false;
    }

    if (publication.kind === Track.Kind.Audio) {
        if (isLocallyDeafened()) return false;
        if (publication.source === Track.Source.ScreenShareAudio) {
            return isScreenMediaPublicationAllowed(publication, participant);
        }
        return true;
    }

    return false;
}

function applyRemotePublicationSubscriptionPolicy(
    publication: TrackPublicationLike,
    participant?: Participant,
): void {
    if (!participant || participant.isLocal) return;
    const shouldSubscribe = shouldSubscribeToRemotePublication(publication, participant);
    try {
        publication.setSubscribed?.(shouldSubscribe);
    } catch (err) {
        devWarn("[voice] failed to apply remote publication subscription policy", err);
    }
}

function applyRemoteParticipantSubscriptionPolicy(participant: Participant): void {
    if (participant.isLocal) return;
    participant.trackPublications.forEach((publication) => {
        applyRemotePublicationSubscriptionPolicy(publication as unknown as TrackPublicationLike, participant);
    });
}

function applyRemoteRoomSubscriptionPolicy(targetRoom: Room): void {
    targetRoom.remoteParticipants.forEach((participant) => {
        applyRemoteParticipantSubscriptionPolicy(participant as unknown as Participant);
    });
}

function syncScreenMediaSubscriptionForIdentity(identity: string): void {
    const room = state.room;
    if (!room) return;
    const participant = findRemoteParticipantByIdentity(room, identity);
    if (!participant) return;
    participant.trackPublications.forEach((publication) => {
        const source = publication.source;
        if (!isScreenMediaSource(source)) return;
        applyRemotePublicationSubscriptionPolicy(publication as unknown as TrackPublicationLike, participant);
    });
}

async function cleanupConnection(disconnectRoom = true) {
    const targetRoom = state.room;
    const localTrack = state.audioTrack;
    if (disconnectRoom && targetRoom) {
        detachRoomEvents(targetRoom);
        // Detach remote audio elements BEFORE disconnect — once the room disconnects
        // LiveKit clears remoteParticipants, making post-disconnect cleanup a no-op
        // and leaving orphaned <audio> elements that cause echo on reconnect.
        controls.detachRemoteAudioTracks(targetRoom);
        try {
            await targetRoom.disconnect();
        } catch {
            // ignore
        }
    }
    releaseConnectionResources(targetRoom, localTrack);
}
/** Return whether the active room is currently connected to LiveKit. */
export function isVoiceConnected() {
    return state.room !== null && state.room.state === LiveKitConnectionState.Connected;
}
/** Return whether this client still owns a desired LiveKit transport, including reconnecting rooms. */
export function hasDesiredVoiceTransport() {
    return state.desired && state.room !== null &&
        state.room.state !== LiveKitConnectionState.Disconnected;
}
/**
 * Apply a server-rotated room key (member joined/left) to the live key provider at its
 * keyring index. Seamless: LiveKit keeps recent keys so in-flight frames keep decrypting.
 * No-op when there is no active voice transport.
 */
export async function rotateVoiceKey(e2eeKey: string, keyIndex: number) {
    // Gate on the desired-session intent, not on state.room. The key provider is
    // created (and the room constructed) inside connectOnce; a VOICE_KEY_UPDATE can
    // arrive in the window after setupE2EE() but before state.room is assigned. Keys
    // set on the provider before the Room exists are replayed by LiveKit's E2eeManager
    // on init, so applying here is safe and avoids silently dropping a rotation.
    // applyE2EEKey() itself no-ops when no provider is active yet.
    if (!state.desired) {
        devWarn("[voice] rotateVoiceKey skipped — no desired voice session");
        return;
    }
    await applyE2EEKey(e2eeKey, keyIndex);
    // A freshly installed key resolves the MissingKey that triggers rotation-race
    // encryption errors, so cancel any pending escalation to a drop/rejoin.
    clearEncryptionEscalation();
}
async function connectOnce(sessionId: number, token: string, options: VoiceConnectOptions) {
    await cleanupConnection(true);
    if (!isDesiredSession(sessionId)) return;
    let preferredMicrophoneDeviceId = getPreferredVoiceDeviceId("audioinput");
    let preferredSpeakerDeviceId = getPreferredVoiceDeviceId("audiooutput");
    try {
        const { audioInputs, audioOutputs } = await listVoiceAudioDevices(false);
        preferredMicrophoneDeviceId = coercePreferredVoiceDeviceId("audioinput", audioInputs);
        preferredSpeakerDeviceId = coercePreferredVoiceDeviceId("audiooutput", audioOutputs);
    } catch {
        // ignore and fall back to stored preferences/defaults
    }
    if (!options.e2eeKey) {
        throw new Error("missing_e2ee_key");
    }
    const e2eeOptions = await setupE2EE(options.e2eeKey, options.e2eeKeyIndex ?? 0);
    const nextRoom = new Room({
        encryption: e2eeOptions,
        reconnectPolicy: new DefaultReconnectPolicy(),
        dynacast: true,
        adaptiveStream: true,
    });
    await nextRoom.setE2EEEnabled(true);
    state.room = nextRoom;
    let connectedAt = 0;
    let hasRetried = false;
    const EARLY_DISCONNECT_GRACE_MS = 2000;
    const subscriptionRetryAttemptsByTrackSid = new Map<string, number>();
    const subscriptionRetryTimersByTrackSid = new Map<string, ReturnType<typeof setTimeout>>();

    const clearSubscriptionRetry = (trackSid: string) => {
        const normalizedTrackSid = normalizeTrackSid(trackSid);
        if (!normalizedTrackSid) return;
        const timer = subscriptionRetryTimersByTrackSid.get(normalizedTrackSid);
        if (timer) {
            clearTimeout(timer);
            subscriptionRetryTimersByTrackSid.delete(normalizedTrackSid);
        }
        subscriptionRetryAttemptsByTrackSid.delete(normalizedTrackSid);
    };

    const clearAllSubscriptionRetries = () => {
        subscriptionRetryTimersByTrackSid.forEach((timer) => clearTimeout(timer));
        subscriptionRetryTimersByTrackSid.clear();
        subscriptionRetryAttemptsByTrackSid.clear();
    };

    const scheduleSubscriptionRetry = (
        participant: Participant,
        trackSid: string,
        reason: string,
    ) => {
        if (state.room !== nextRoom) return;
        if (participant.isLocal) return;
        const normalizedTrackSid = normalizeTrackSid(trackSid);
        if (!normalizedTrackSid) return;

        const publication = findRemotePublicationByTrackSid(participant, normalizedTrackSid);
        if (!publication || publication.kind !== Track.Kind.Audio) return;
        if (!shouldSubscribeToRemotePublication(publication, participant)) {
            clearSubscriptionRetry(normalizedTrackSid);
            return;
        }
        if (publication.isSubscribed === true) {
            clearSubscriptionRetry(normalizedTrackSid);
            return;
        }

        const nextAttempt = (subscriptionRetryAttemptsByTrackSid.get(normalizedTrackSid) ?? 0) + 1;
        if (nextAttempt > SUBSCRIPTION_RETRY_MAX_ATTEMPTS) {
            clearSubscriptionRetry(normalizedTrackSid);
            devWarn("[voice] remote track subscription recovery exhausted", {
                participantIdentity: participant.identity?.trim() ?? "",
                trackSid: normalizedTrackSid,
                reason,
            });
            return;
        }

        const existingTimer = subscriptionRetryTimersByTrackSid.get(normalizedTrackSid);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        subscriptionRetryAttemptsByTrackSid.set(normalizedTrackSid, nextAttempt);

        const delayMs = SUBSCRIPTION_RETRY_BASE_DELAY_MS * nextAttempt;
        const timer = setTimeout(() => {
            if (state.room !== nextRoom) return;
            subscriptionRetryTimersByTrackSid.delete(normalizedTrackSid);
            const currentPublication = findRemotePublicationByTrackSid(participant, normalizedTrackSid);
            if (!currentPublication || currentPublication.kind !== Track.Kind.Audio) {
                clearSubscriptionRetry(normalizedTrackSid);
                return;
            }
            if (!shouldSubscribeToRemotePublication(currentPublication, participant)) {
                clearSubscriptionRetry(normalizedTrackSid);
                return;
            }
            if (currentPublication.isSubscribed === true) {
                clearSubscriptionRetry(normalizedTrackSid);
                return;
            }
            try {
                currentPublication.setSubscribed?.(true);
                devWarn("[voice] retrying remote track subscribe", {
                    participantIdentity: participant.identity?.trim() ?? "",
                    trackSid: normalizedTrackSid,
                    attempt: nextAttempt,
                    reason,
                });
            } catch (err) {
                devWarn("[voice] remote track subscribe retry failed", {
                    participantIdentity: participant.identity?.trim() ?? "",
                    trackSid: normalizedTrackSid,
                    attempt: nextAttempt,
                    reason,
                    error: err,
                });
                scheduleSubscriptionRetry(participant, normalizedTrackSid, `${reason}:retry_error`);
            }
        }, delayMs);

        subscriptionRetryTimersByTrackSid.set(normalizedTrackSid, timer);
    };

    const handleTrackSubscribed = (
        track: Track,
        publication?: {
            setSubscribed?: (subscribed: boolean) => void;
            source?: Track.Source;
            trackSid?: string;
        },
        participant?: Participant,
    ) => {
        if (!participant || participant.isLocal) return;
        const publicationLike: TrackPublicationLike = publication
            ? {
                kind: track.kind,
                source: publication.source,
                trackSid: publication.trackSid,
                setSubscribed: (subscribed: boolean) => {
                    publication.setSubscribed?.(subscribed);
                },
            }
            : {
                kind: track.kind,
            };
        clearSubscriptionRetry(publicationLike.trackSid ?? "");
        const source = publicationLike.source;
        applyRemotePublicationSubscriptionPolicy(publicationLike, participant);

        if (isScreenMediaSource(source) && !isScreenMediaPublicationAllowed(publicationLike, participant)) {
            if (track.kind === Track.Kind.Audio) {
                voiceOutputHandler.handleRemoteTrackUnsubscribed(track, participant);
            }
            return;
        }

        if (isScreenMediaSource(source)) {
            finalizeScreenOptInLatency(
                participant.identity?.trim() ?? "",
                publicationLike?.trackSid?.trim() ?? "",
            );
        }

        if (track.kind === Track.Kind.Video) return;
        if (track.kind !== Track.Kind.Audio) return;
        if (isLocallyDeafened()) {
            voiceOutputHandler.handleRemoteTrackUnsubscribed(track, participant);
            try {
                publication?.setSubscribed?.(false);
            } catch (err) {
                devWarn("[voice] failed to suppress remote audio while deafened", err);
            }
            return;
        }
        voiceOutputHandler.handleRemoteTrackSubscribed(track, participant, publication?.source);
        devLog("[voice] remote audio attached");
    };
    const handleTrackUnsubscribed = (
        track: Track,
        publication?: { source?: Track.Source; trackSid?: string },
        participant?: Participant,
    ) => {
        clearSubscriptionRetry(publication?.trackSid ?? "");
        if (track.kind !== Track.Kind.Audio) return;
        voiceOutputHandler.handleRemoteTrackUnsubscribed(track, participant);
        devLog("[voice] remote audio detached");
    };
    const handleReconnecting = () => {
        if (state.room !== nextRoom) return;
        stopLatencyPolling();
        devWarn("[voice] reconnecting");
    };
    const handleSignalReconnecting = () => {
        if (state.room !== nextRoom) return;
        devWarn("[voice] signal reconnecting");
    };
    const handleReconnected = async () => {
        if (state.room !== nextRoom) return;
        // A successful transport reconnect clears any stale encryption-error escalation.
        clearEncryptionEscalation();
        startLatencyPolling(() => state.audioTrack);
        voiceOutputHandler.applySpeakerLevelToRoom(nextRoom);
        syncSpeakingUsersFromParticipants(nextRoom.activeSpeakers);
        applyRemoteRoomSubscriptionPolicy(nextRoom);
        updateAutoplayUnlockState(!nextRoom.canPlaybackAudio);
        devLog("[voice] reconnected");
    };
    const handleConnectionStateChanged = (connectionState?: LiveKitConnectionState) => {
        if (state.room !== nextRoom) return;
        const connectionStateName = connectionState ?? "unknown";
        devLog("[voice] connection state changed", {
            state: connectionStateName,
        });
    };
    const handleDisconnected = async (reason?: DisconnectReason) => {
        if (state.room !== nextRoom) return;
        clearAllSubscriptionRetries();
        if (reason === DisconnectReason.CLIENT_INITIATED) return;
        recordReconnectReason(reason);
        const reconnectReasonCount = voiceMetrics.reconnectReasonCount.get(String(reason ?? "unknown")) ?? 0;
        const reasonName = describeVoiceDisconnectReason(reason) || String(reason ?? "unknown");
        const shouldNotify = isDesiredSession(sessionId);
        stopLatencyPolling();
        await cleanupConnection(false);
        if (!shouldNotify) return;
        if (isUnrecoverableDisconnect(reason)) {
            clearConnectionIntent();
            devWarn("[voice] disconnected with unrecoverable reason", {
                reason: reasonName,
                reconnectReasonCount,
            });
            await options.onPermanentDisconnect({
                reason: reasonName,
                recoverable: false,
                reconnectReasonCount,
            });
            return;
        }
        state.joinNotified = false;
        // If disconnected shortly after connecting and haven't retried yet,
        // this is likely a race with the old room's server-side cleanup.
        // Retry the connection once instead of giving up.
        const elapsed = connectedAt > 0 ? Date.now() - connectedAt : Infinity;
        if (!hasRetried && elapsed < EARLY_DISCONNECT_GRACE_MS) {
            hasRetried = true;
            devWarn("[voice] early disconnect, retrying once", {
                reason,
                elapsed,
                reconnectReasonCount,
            });
            try {
                await connectOnce(sessionId, token, options);
            } catch (err) {
                devWarn("[voice] retry failed", { error: err });
                clearConnectionIntent();
                await options.onPermanentDisconnect({
                    reason: reasonName,
                    recoverable: false,
                    reconnectReasonCount,
                });
            }
            return;
        }
        devWarn("[voice] disconnected after LiveKit reconnect handling", {
            reason: reasonName,
            reconnectReasonCount,
        });
        clearConnectionIntent();
        if (options.onRecoverableDisconnect) {
            await options.onRecoverableDisconnect({
                reason: reasonName,
                recoverable: true,
                reconnectReasonCount,
            });
        } else {
            await options.onPermanentDisconnect({
                reason: reasonName,
                recoverable: true,
                reconnectReasonCount,
            });
        }
    };
    const handleActiveSpeakersChanged = (participants: Participant[]) => {
        if (state.room !== nextRoom) return;
        syncSpeakingUsersFromParticipants(participants);
    };
    const handleParticipantConnected = (participant?: Participant) => {
        if (state.room !== nextRoom) return;
        if (participant && !participant.isLocal) {
            applyRemoteParticipantSubscriptionPolicy(participant);
        }
    };
    const handleParticipantDisconnected = (participant?: Participant) => {
        if (state.room !== nextRoom) return;
        const identity = participant?.identity?.trim() ?? "";
        participant?.trackPublications?.forEach((publication) => {
            clearSubscriptionRetry(publication?.trackSid ?? "");
        });
        clearScreenMediaAllowance(identity);
        clearCameraAllowance(identity);
        playLeaveSound();
    };
    const handleParticipantActive = (participant?: Participant) => {
        if (state.room !== nextRoom) return;
        if (!participant || participant.isLocal) return;
        applyRemoteParticipantSubscriptionPolicy(participant);
        playJoinSound();
    };
    const handleTrackPublished = (
        publication?: { kind?: Track.Kind; source?: Track.Source; trackSid?: string },
        participant?: Participant,
    ) => {
        if (state.room !== nextRoom) return;
        if (!participant || participant.isLocal) return;
        if (publication?.source === Track.Source.ScreenShare) {
            const identity = participant.identity?.trim() ?? "";
            clearScreenMediaAllowance(identity);
            withAppStore((app) => {
                app.setUserScreenSharing(identity, true);
            });
            playScreenShareStartSound();
        }
        if (publication?.source === Track.Source.Camera) {
            // A freshly published camera starts opt-in: drop any stale allowance so
            // the remote user is not auto-subscribed/downloaded.
            const identity = participant.identity?.trim() ?? "";
            clearCameraAllowance(identity);
        }
        const participantPublication = publication?.source
            ? participant.getTrackPublication(publication.source)
            : null;
        applyRemotePublicationSubscriptionPolicy(
            (participantPublication ?? publication) as TrackPublicationLike,
            participant,
        );
    };
    const handleTrackUnpublished = (
        publication?: { kind?: Track.Kind; source?: Track.Source; trackSid?: string },
        participant?: Participant,
    ) => {
        if (state.room !== nextRoom) return;
        if (!participant || participant.isLocal) return;
        clearSubscriptionRetry(publication?.trackSid ?? "");
        if (publication?.source === Track.Source.ScreenShare) {
            const identity = participant.identity?.trim() ?? "";
            clearScreenMediaAllowance(identity);
            withAppStore((app) => {
                app.setUserScreenSharing(identity, false);
            });
            playScreenShareStopSound();
        }
        if (publication?.source === Track.Source.Camera) {
            const identity = participant.identity?.trim() ?? "";
            clearCameraAllowance(identity);
        }
    };
    const handleTrackSubscriptionFailed = (
        trackSid: string,
        participant?: Participant,
        reason?: unknown,
    ) => {
        if (state.room !== nextRoom) return;
        if (!participant || participant.isLocal) return;
        const normalizedTrackSid = normalizeTrackSid(trackSid);
        if (!normalizedTrackSid) return;
        const publication = findRemotePublicationByTrackSid(participant, normalizedTrackSid);
        if (!publication || publication.kind !== Track.Kind.Audio) return;
        if (!shouldSubscribeToRemotePublication(publication, participant)) return;
        devWarn("[voice] remote track subscription failed", {
            participantIdentity: participant.identity?.trim() ?? "",
            trackSid: normalizedTrackSid,
            reason,
        });
        scheduleSubscriptionRetry(participant, normalizedTrackSid, "track_subscription_failed");
    };
    const handleTrackSubscriptionStatusChanged = (
        publication?: {
            kind?: Track.Kind;
            source?: Track.Source;
            trackSid?: string;
            isSubscribed?: boolean;
        },
        status?: string,
        participant?: Participant,
    ) => {
        if (state.room !== nextRoom) return;
        if (!publication || !participant || participant.isLocal) return;
        const normalizedTrackSid = normalizeTrackSid(publication.trackSid);
        if (!normalizedTrackSid) return;
        if (publication.kind !== Track.Kind.Audio) {
            clearSubscriptionRetry(normalizedTrackSid);
            return;
        }

        if (!shouldSubscribeToRemotePublication(publication, participant)) {
            clearSubscriptionRetry(normalizedTrackSid);
            return;
        }

        const normalizedStatus = String(status ?? "").toLowerCase();
        if (publication.isSubscribed === true || normalizedStatus === "subscribed") {
            clearSubscriptionRetry(normalizedTrackSid);
            return;
        }

        if (normalizedStatus === "unsubscribed") {
            scheduleSubscriptionRetry(participant, normalizedTrackSid, "status_unsubscribed");
        }
    };
    const handleParticipantEncryptionStatusChanged = (
        enabled: boolean,
        participant?: Participant,
    ) => {
        if (state.room !== nextRoom) return;
        const participantIdentity = participant?.identity?.trim() || undefined;
        if (enabled) {
            devLog("[voice] participant encryption enabled", { participantIdentity });
            return;
        }
        setVoiceError("Voice encryption disabled");
        devWarn("[voice] participant encryption disabled", { participantIdentity });
    };
    const handleEncryptionError = (error: Error, participant?: Participant) => {
        if (state.room !== nextRoom) return;
        // Do NOT tear down on the first error. During a key rotation a remote frame can
        // arrive stamped with the new key index a moment before this client receives the
        // matching VOICE_KEY_UPDATE; LiveKit surfaces that as a (throttled) EncryptionError
        // even though the keyring self-heals once the key lands. Dropping here caused the
        // whole channel to churn (leave + rejoin) on every join/leave. Defer escalation and
        // let applyE2EEKey() cancel it when the key actually arrives.
        devWarn("[voice] encryption error (deferring recovery, expected during key rotation)", {
            detail: describeVoiceEncryptionError(error),
            participantIdentity: participant?.identity?.trim() || undefined,
            graceMs: ENCRYPTION_ERROR_GRACE_MS,
        });
        if (encryptionEscalationTimer) return; // escalation already scheduled
        encryptionEscalationTimer = setTimeout(() => {
            encryptionEscalationTimer = null;
            if (state.room !== nextRoom) return;
            setVoiceError(userFacingVoiceEncryptionError(error));
            devError("[voice] encryption error persisted past grace — escalating to recovery", {
                detail: describeVoiceEncryptionError(error),
                participantIdentity: participant?.identity?.trim() || undefined,
                graceMs: ENCRYPTION_ERROR_GRACE_MS,
            });
            void options.onEncryptionError?.();
        }, ENCRYPTION_ERROR_GRACE_MS);
    };
    const handleAudioPlaybackStatusChanged = () => {
        if (state.room !== nextRoom) return;
        updateAutoplayUnlockState(!nextRoom.canPlaybackAudio);
    };
    const roomHandlers: RoomEventHandlers = {
        trackSubscribed: handleTrackSubscribed,
        trackUnsubscribed: handleTrackUnsubscribed,
        activeSpeakersChanged: handleActiveSpeakersChanged,
        participantConnected: handleParticipantConnected,
        participantDisconnected: handleParticipantDisconnected,
        participantActive: handleParticipantActive,
        trackPublished: handleTrackPublished,
        trackUnpublished: handleTrackUnpublished,
        trackSubscriptionFailed: handleTrackSubscriptionFailed,
        trackSubscriptionStatusChanged: handleTrackSubscriptionStatusChanged,
        participantEncryptionStatusChanged: handleParticipantEncryptionStatusChanged,
        encryptionError: handleEncryptionError,
        reconnecting: handleReconnecting,
        signalReconnecting: handleSignalReconnecting,
        connectionStateChanged: handleConnectionStateChanged,
        reconnected: handleReconnected,
        disconnected: handleDisconnected,
        audioPlaybackStatusChanged: handleAudioPlaybackStatusChanged,
    };
    attachRoomEvents(nextRoom, roomHandlers);
    try {
        if (!options.livekitUrl) {
            devError("[voice] livekitUrl must be provided by the client, fallback is not allowed");
            throw new Error("[voice] livekitUrl must be provided by the client, fallback is not allowed");
        }
        const livekitUrl = options.livekitUrl;
        devLog("[voice] connecting", {
            livekitUrl,
            hasE2eeKey: Boolean(options.e2eeKey),
        });
        try {
            await nextRoom.prepareConnection(livekitUrl, token);
        } catch (err) {
            devWarn("[voice] prepareConnection failed, continuing with connect", err);
        }
        await nextRoom.connect(livekitUrl, token, {
            autoSubscribe: false,
            maxRetries: INITIAL_CONNECT_RETRIES,
        });
        connectedAt = Date.now();
        syncScreenSharingUsersFromRoom(nextRoom);
        applyRemoteRoomSubscriptionPolicy(nextRoom);
        voiceOutputHandler.applySpeakerLevelToRoom(nextRoom);
        if (supportsSpeakerSelection()) {
            try {
                await nextRoom.switchActiveDevice("audiooutput", preferredSpeakerDeviceId);
            } catch (err) {
                devWarn("[voice] failed to apply preferred speaker device", err);
            }
        }
        if (!isDesiredSession(sessionId)) {
            await cleanupConnection(true);
            return;
        }
        const voiceProcessingSettings = getVoiceProcessingSettings();
        voiceInputHandler.setInputSensitivitySettings(
            voiceProcessingSettings.inputSensitivityMode,
            voiceProcessingSettings.inputSensitivityThreshold,
        );
        const shouldMicrophoneBeEnabled = !isLocallyMuted();
        voiceInputHandler.setMicrophoneEnabled(shouldMicrophoneBeEnabled);
        const useKrisp = KRISP_ENABLED && voiceProcessingSettings.noiseCancellationMethod === NoiseCancellationMethod.Krisp;
        const effectiveNoiseSuppression = !useKrisp;
        const effectiveVoiceIsolation = !useKrisp;
        state.audioTrack = await createLocalAudioTrack({
            echoCancellation: true,
            noiseSuppression: effectiveNoiseSuppression,
            autoGainControl: true,
            voiceIsolation: effectiveVoiceIsolation,
            deviceId: preferredMicrophoneDeviceId,
        });
        await voiceInputHandler.applyToTrack(state.audioTrack);
        if (!isDesiredSession(sessionId)) {
            state.audioTrack.stop();
            state.audioTrack = null;
            await cleanupConnection(true);
            return;
        }
        await withTimeout(
            nextRoom.localParticipant.publishTrack(state.audioTrack, {
                red: true,
            }),
            TRACK_PUBLISH_TIMEOUT_MS,
            "Timed out while publishing local microphone track",
        );
        // Apply Krisp processor after track is published
        if (useKrisp && state.audioTrack) {
            await applyKrispToTrack(state.audioTrack);
        }
        updateAutoplayUnlockState(!nextRoom.canPlaybackAudio);
        startLatencyPolling(() => state.audioTrack);
        if (!shouldMicrophoneBeEnabled) {
            await setLocalMicrophoneEnabled(false);
        }
        if (isLocallyDeafened()) {
            controls.setRemoteAudioSubscribed(nextRoom, false);
        }
        voiceInputHandler.queueApply();
        syncSpeakingUsersFromParticipants(nextRoom.activeSpeakers);
        syncScreenSharingUsersFromRoom(nextRoom);
        if (!isDesiredSession(sessionId)) {
            await cleanupConnection(true);
            return;
        }
        try {
            const app = useAppStore();
            app.setVoiceConnected(true);
        } catch {
            // ignore if store not ready
        }
        if (!state.joinNotified) {
            state.joinNotified = true;
            playJoinSound();
            await options.onJoined();
        }
        devLog("[voice] connected");
    } catch (err) {
        clearAllSubscriptionRetries();
        await cleanupConnection(true);
        throw err;
    }
}
async function connectWithLiveKitRetryPolicy(
    sessionId: number,
    token: string,
    options: VoiceConnectOptions,
) {
    try {
        await connectOnce(sessionId, token, options);
    } catch (err) {
        if (!isDesiredSession(sessionId)) return;
        clearConnectionIntent();
        setVoiceError(userFacingVoiceConnectError(err));
        const logger = isUnrecoverableError(err) ? devError : devWarn;
        logger("[voice] connect failed", {
            detail: describeVoiceConnectError(err),
            error: err,
        });
        await options.onPermanentDisconnect({
            reason: describeVoiceConnectError(err),
            recoverable: false,
            reconnectReasonCount: 0,
        });
    }
}
async function runConnectLoop() {
    if (state.loopRunning) return;
    state.loopRunning = true;
    while (state.desired && state.sessionId && state.token && state.options) {
        const sessionId = state.sessionId;
        const token = state.token;
        const options = state.options;
        await connectWithLiveKitRetryPolicy(sessionId, token, options);
        if (!state.desired) break;
        if (state.sessionId !== sessionId) continue;
        break;
    }
    state.loopRunning = false;
}
/** Connect to the requested LiveKit room or update the desired active session. */
export async function connectVoice(token: string, options: VoiceConnectOptions) {
    if (!token) {
        devWarn("[voice] missing token");
        return;
    }
    state.desired = true;
    if (state.sessionId !== options.sessionId) {
        state.sessionId = options.sessionId;
        state.joinNotified = false;
    }
    state.token = token;
    state.options = options;
    const isSessionSwitch = !state.joinNotified; // session ID changed → new channel
    if (state.room && state.audioTrack && state.room.state === LiveKitConnectionState.Connected && !isSessionSwitch) {
        syncSpeakingUsersFromParticipants(state.room.activeSpeakers);
        updateAutoplayUnlockState(!state.room.canPlaybackAudio);
        return;
    }
    if (!state.loopRunning) {
        void runConnectLoop();
    }
}

type ReleaseTransportOptions = {
    clearIntent: boolean;
    playLeaveCue: boolean;
};

async function releaseCurrentVoiceTransport({
    clearIntent,
    playLeaveCue,
}: ReleaseTransportOptions): Promise<boolean> {
    const targetRoom = state.room;
    const localTrack = state.audioTrack;
    const hadConnection = Boolean(targetRoom || localTrack);
    if (clearIntent) {
        clearConnectionIntent();
    }
    if (!targetRoom) {
        releaseConnectionResources(null, localTrack);
        if (hadConnection && playLeaveCue) playLeaveSound();
        return hadConnection;
    }
    try {
        await targetRoom.disconnect();
    } catch (err) {
        devWarn("[voice] disconnect failed during transport termination", err);
    }
    releaseConnectionResources(targetRoom, localTrack);
    if (hadConnection && playLeaveCue) playLeaveSound();
    return hadConnection;
}

/** Leave the current voice room and release all asynchronous resources. */
export async function leaveVoice() {
    await releaseCurrentVoiceTransport({
        clearIntent: true,
        playLeaveCue: true,
    });
}

/**
 * Release local LiveKit transport/media after a server-authoritative revoke/switch event,
 * without clearing the desired session intent for an in-flight rejoin.
 */
export async function releaseVoiceTransportForServerTransition() {
    await releaseCurrentVoiceTransport({
        clearIntent: false,
        playLeaveCue: true,
    });
}
/** Tear down the current voice room synchronously for unload-style browser exits. */
export function teardownVoiceSync() {
    const targetRoom = state.room;
    const localTrack = state.audioTrack;
    clearConnectionIntent();
    if (targetRoom) {
        detachRoomEvents(targetRoom);
        try {
            void targetRoom.disconnect().catch(() => {
                // ignore sync disconnect failures
            });
        } catch {
            // ignore sync disconnect failures
        }
    }
    releaseConnectionResources(targetRoom, localTrack);
}
const setLocalMicrophoneEnabled = controls.setLocalMicrophoneEnabled;
/** Mute or unmute the local microphone track. */
export const setMicrophoneMuted = controls.setMicrophoneMuted;
/** Switch the preferred microphone device without leaving the room. */
export const setPreferredMicrophoneDevice = controls.setPreferredMicrophoneDevice;
/** Switch the preferred speaker device without leaving the room. */
export const setPreferredSpeakerDevice = controls.setPreferredSpeakerDevice;
/** Update the remote speaker playback level. */
export const setSpeakerLevel = controls.setSpeakerLevel;
/** Update the playback level override for one remote participant. */
export const setParticipantVolume = controls.setParticipantVolume;
/** Update microphone sensitivity mode and threshold settings. */
export const setInputSensitivitySettings = controls.setInputSensitivitySettings;
/** Subscribe to realtime microphone meter updates. */
export const subscribeVoiceInputMeter = controls.subscribeVoiceInputMeter;
/** Apply the current voice processing settings to the active microphone track. */
export const applyVoiceProcessingSettings = controls.applyVoiceProcessingSettings;
/** Toggle whether remote audio is subscribed while keeping the room connected. */
export function setDeafened(deafened: boolean) {
    controls.setDeafened(deafened);
    const room = state.room;
    if (room) {
        applyRemoteRoomSubscriptionPolicy(room);
    }
}
/** Mute the local user. */
export const muteSelf = controls.muteSelf;
/** Unmute the local user. */
export const unmuteSelf = controls.unmuteSelf;
/** Deafen the local user and mute their microphone. */
export async function deafenSelf() {
    await controls.deafenSelf();
    const room = state.room;
    if (room) {
        applyRemoteRoomSubscriptionPolicy(room);
    }
}
/** Undeafen the local user and restore remote audio subscription. */
export async function undeafenSelf() {
    await controls.undeafenSelf();
    const room = state.room;
    if (room) {
        applyRemoteRoomSubscriptionPolicy(room);
    }
}
/** Return the active Room instance (or null if not connected). */
export function getRoom(): Room | null {
    return state.room;
}

/** Attempt to unlock audio playback after a user gesture. */
export async function startAudioWithUserGesture(): Promise<boolean> {
    const room = state.room;
    if (!room) {
        updateAutoplayUnlockState(false);
        return false;
    }
    try {
        await room.startAudio();
        updateAutoplayUnlockState(!room.canPlaybackAudio);
        return room.canPlaybackAudio;
    } catch (err) {
        updateAutoplayUnlockState(true);
        devWarn("[voice] startAudioWithUserGesture failed", err);
        return false;
    }
}
/** Build simulcast layers appropriate for the chosen camera preset. */
function cameraSimulcastLayers(preset: VideoQualityPreset) {
    if (preset === '1080p30') return [VideoPresets.h360, VideoPresets.h720];
    return [VideoPresets.h180, VideoPresets.h360];
}

function limitSimulcastLayers(
    layers: Array<(typeof VideoPresets)[keyof typeof VideoPresets]>,
    context: "camera" | "screen",
) {
    if (layers.length <= MAX_ADDITIONAL_SIMULCAST_LAYERS) return layers;
    devWarn("[voice] too many simulcast layers configured, trimming", {
        context,
        layerCount: layers.length,
        maxAdditionalLayers: MAX_ADDITIONAL_SIMULCAST_LAYERS,
    });
    return layers.slice(0, MAX_ADDITIONAL_SIMULCAST_LAYERS);
}

// Encoding is determined only by the selected screen-share quality preset.
function screenShareEncoding(preset: VideoQualityPreset) {
    if (preset === '1080p30') {
        return ScreenSharePresets.h1080fps30.encoding;
    }
    // 720p60: keep 60 FPS with a reasonable bitrate (no SDK preset for 720p@60).
    return { maxBitrate: 3_000_000, maxFramerate: 60 };
}

function screenShareSimulcastLayers(preset: VideoQualityPreset) {
    if (preset === '1080p30') {
        return limitSimulcastLayers([VideoPresets.h360, VideoPresets.h720], "screen");
    }
    return limitSimulcastLayers([VideoPresets.h180, VideoPresets.h360], "screen");
}

/** Enable the local camera and publish the video track using the stored quality preset. */
export async function enableCamera() {
    if (!state.room || state.room.state !== LiveKitConnectionState.Connected) {
        throw new Error("Not connected to a voice channel");
    }
    if (state.videoTrack) return;
    const preset = getCameraQualityPreset();
    const { width, height, frameRate } = VIDEO_QUALITY_PRESETS[preset];
    const deviceId = getPreferredCameraDeviceId();
    state.videoTrack = await createLocalVideoTrack({
        resolution: { width, height, frameRate },
        deviceId: deviceId !== 'default' ? deviceId : undefined,
    });
    const layers = limitSimulcastLayers(cameraSimulcastLayers(preset), "camera");
    await state.room.localParticipant.publishTrack(state.videoTrack, {
        simulcast: true,
        videoSimulcastLayers: layers,
    });
    devLog("[voice] camera enabled", { preset, deviceId, layers: layers.length });
}
/** Disable the local camera and unpublish the video track. */
export async function disableCamera() {
    if (!state.videoTrack) return;
    const track = state.videoTrack;
    state.videoTrack = null;
    if (state.room) {
        try {
            await state.room.localParticipant.unpublishTrack(track);
        } catch (err) {
            devWarn("[voice] failed to unpublish video track", err);
        }
    }
    track.stop();
    devLog("[voice] camera disabled");
}
/** Enable screen sharing with system audio and publish video + audio tracks. */
export async function enableScreenShare() {
    if (!state.room || state.room.state !== LiveKitConnectionState.Connected) {
        throw new Error("Not connected to a voice channel");
    }
    if (state.screenTrack) return;
    const preset = getScreenShareQualityPreset();
    const { width, height, frameRate } = VIDEO_QUALITY_PRESETS[preset];
    const tracks = await createLocalScreenTracks({
        audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
        },
        contentHint: "detail",
        resolution: { width, height, frameRate },
        suppressLocalAudioPlayback: true,
    });
    const videoTrack = tracks.find((t) => t.kind === Track.Kind.Video) as LocalVideoTrack | undefined;
    const audioTrack = tracks.find((t) => t.kind === Track.Kind.Audio);
    if (!videoTrack) throw new Error("No video track from screen capture");
    state.screenTrack = videoTrack;
    detachScreenTrackEndedListener(videoTrack);
    const encoding = screenShareEncoding(preset);
    const layers = screenShareSimulcastLayers(preset);
    await state.room.localParticipant.publishTrack(state.screenTrack, {
        screenShareEncoding: encoding,
        degradationPreference: 'maintain-resolution',
        simulcast: true,
        videoSimulcastLayers: layers,
    });
    // Publish system audio track if the browser provided one
    if (audioTrack && state.room) {
        state.screenAudioTrack = audioTrack;
        await state.room.localParticipant.publishTrack(audioTrack, {
            dtx: false,
            red: true,
        });
        devLog("[voice] screen share audio published");
    }
    playScreenShareStartSound();
    // When the user stops sharing via the browser's built-in "Stop sharing" button,
    // the track fires an "ended" event. Clean up automatically.
    const endedListener = () => {
        if (state.screenTrack !== videoTrack) return;
        void disableScreenShare();
    };
    state.screenTrackEndedListener = endedListener;
    state.screenTrack.mediaStreamTrack.addEventListener("ended", endedListener);
    setLocalScreenShareStoreState(true);
    devLog("[voice] screen share enabled", {
        preset,
        hasAudio: !!audioTrack,
        simulcastLayers: layers.length,
    });
}
/**
 * Re-apply the per-participant remote camera subscription policy.
 *
 * Remote camera is opt-in, so this never blanket-subscribes: it only honours the
 * per-identity camera allowlist. Passing `false` is a data-saving cleanup that
 * drops every camera allowance (e.g. when the voice grid closes), which unsubscribes
 * all remote camera tracks. Screen-share and audio subscriptions are left untouched.
 */
export function setRemoteVideoSubscribed(subscribed: boolean) {
    const room = state.room;
    if (!room) return;
    if (!subscribed) {
        cameraAllowedByIdentity.clear();
    }
    room.remoteParticipants.forEach((participant) => {
        participant.trackPublications.forEach((publication) => {
            if (publication.kind !== Track.Kind.Video) return;
            if (publication.source === Track.Source.ScreenShare) return;
            applyRemotePublicationSubscriptionPolicy(
                publication as unknown as TrackPublicationLike,
                participant as unknown as Participant,
            );
        });
    });
    devLog(`[voice] remote camera subscriptions reconciled (cleanup=${!subscribed})`);
}

/** Disable screen sharing and unpublish video + audio screen tracks. */
/** Disable screen sharing and unpublish video + audio screen tracks. */
export async function disableScreenShare() {
    if (!state.screenTrack && !state.screenAudioTrack) {
        setLocalScreenShareStoreState(false)
        return
    }

    const videoTrack = state.screenTrack
    const audioTrack = state.screenAudioTrack

    detachScreenTrackEndedListener(videoTrack)
    state.screenTrack = null
    state.screenAudioTrack = null

    try {
        if (state.room) {
            if (videoTrack) {
                try {
                    await state.room.localParticipant.unpublishTrack(videoTrack)
                } catch (err) {
                    devWarn("[voice] failed to unpublish screen video track", err)
                }
            }

            if (audioTrack) {
                try {
                    await state.room.localParticipant.unpublishTrack(audioTrack)
                } catch (err) {
                    devWarn("[voice] failed to unpublish screen audio track", err)
                }
            }
        }

        videoTrack?.stop()
        audioTrack?.stop()
        playScreenShareStopSound()
        devLog("[voice] screen share disabled")
    } finally {
        setLocalScreenShareStoreState(false)
    }
}

/** Mute or unmute the screen share audio track. */
export function setScreenShareAudioMuted(muted: boolean) {
    const track = state.screenAudioTrack;
    if (!track) return;
    if (muted) {
        track.mute();
    } else {
        track.unmute();
    }
    devLog(`[voice] screen share audio ${muted ? "muted" : "unmuted"}`);
}

/** Return whether a screen share audio track is currently published. */
export function hasScreenShareAudio(): boolean {
    return state.screenAudioTrack !== null;
}

/**
 * Switch the preferred camera device. If a camera track is active, republish it.
 * Returns true if applied immediately, false if saved for next session.
 */
export async function setPreferredCamera(deviceId: string): Promise<boolean> {
    setPreferredCameraDeviceId(deviceId);
    if (!state.videoTrack || !state.room || state.room.state !== LiveKitConnectionState.Connected) {
        return false;
    }
    // Republish with new device
    await disableCamera();
    await enableCamera();
    return true;
}

/**
 * Apply a camera quality preset at runtime. If the camera is active, republish the track.
 * Returns true if applied immediately, false if saved for next session.
 */
export async function applyCameraQualityPreset(): Promise<boolean> {
    if (!state.videoTrack || !state.room || state.room.state !== LiveKitConnectionState.Connected) {
        return false;
    }
    await disableCamera();
    await enableCamera();
    return true;
}

/**
 * Apply a screen share quality preset at runtime. If screen sharing is active, republish the track.
 * Returns true if applied immediately, false if saved for next session.
 */
export async function applyScreenShareQualityPreset(): Promise<boolean> {
    if (!state.screenTrack || !state.room || state.room.state !== LiveKitConnectionState.Connected) {
        return false;
    }
    await disableScreenShare();
    useAppStore().localScreenShareEnabled = true;
    await enableScreenShare();
    return true;
}
