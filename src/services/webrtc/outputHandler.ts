import { Track } from "livekit-client";
import type { Participant, Room } from "livekit-client";
import {
    DEFAULT_PARTICIPANT_VOLUME_PERCENT,
    normalizeParticipantVolumePercent,
    normalizeVoiceLevelPercent,
    readStoredParticipantVolume,
    readStoredVoiceLevel,
    voiceLevelToGain,
    writeStoredParticipantVolume,
    writeStoredVoiceLevel,
} from "@/src/services/webrtc/utils";

/**
 * Remote audio playback management and per-participant volume control.
 *
 * Used by: livekit.ts and controls.ts.
 * Depends on: utils.ts for persisted speaker level state and gain conversion.
 */
/** Dependencies required to build the remote audio output handler. */
export type VoiceOutputHandlerOptions = {
    warn: (message: string, error?: unknown) => void;
};

type RemoteAudioTrackLike = {
    kind?: Track.Kind;
    attach: () => HTMLMediaElement | HTMLMediaElement[];
    detach: () => HTMLMediaElement[];
};

// --- Persistent speaker level storage ---
const SPEAKER_LEVEL_STORAGE_KEY = "kergit:voice:speaker-level";

function normalizeParticipantId(participant: Participant | null | undefined): string {
    const identity = participant?.identity;
    if (!identity || typeof identity !== "string") return "";
    return identity.trim();
}

function resolveSpeakerSource(
    source: Track.Source | undefined
): Track.Source.Microphone | Track.Source.ScreenShareAudio {
    return source === Track.Source.ScreenShareAudio
        ? Track.Source.ScreenShareAudio
        : Track.Source.Microphone;
}

/** Public control surface returned by createVoiceOutputHandler(). */
export type VoiceOutputHandler = {
    getSpeakerLevel: () => number;
    getParticipantVolume: (userId: string) => number;
    setSpeakerLevel: (levelPercent: number, targetRoom: Room | null) => void;
    setParticipantVolume: (userId: string, levelPercent: number) => void;
    applySpeakerLevelToParticipant: (
        participant: Participant | null | undefined,
        source?: Track.Source
    ) => void;
    applySpeakerLevelToRoom: (targetRoom: Room | null) => void;
    handleRemoteTrackSubscribed: (
        track: Track,
        participant: Participant | null | undefined,
        source?: Track.Source
    ) => void;
    handleRemoteTrackUnsubscribed: (track: Track, participant?: Participant | null | undefined) => void;
    reset: () => void;
};

/** Create the output handler that manages remote playback and speaker levels. */
export function createVoiceOutputHandler(options: VoiceOutputHandlerOptions): VoiceOutputHandler {
    const { warn } = options;
    let speakerLevelPercent = readStoredVoiceLevel(SPEAKER_LEVEL_STORAGE_KEY, 100);
    const participantVolumes = new Map<string, number>();

    function applySpeakerLevelToParticipant(
        participant: Participant | null | undefined,
        source?: Track.Source
    ) {
        const maybeRemote = participant as unknown as {
            setVolume?: (
                value: number,
                volumeSource?: Track.Source.Microphone | Track.Source.ScreenShareAudio
            ) => void
        } | null | undefined;
        if (!maybeRemote?.setVolume) return;
        const participantId = normalizeParticipantId(participant);
        const participantVolumePercent = participantId
            ? getParticipantVolume(participantId)
            : DEFAULT_PARTICIPANT_VOLUME_PERCENT;
        const effectiveGain = voiceLevelToGain(speakerLevelPercent) * (participantVolumePercent / 100);
        maybeRemote.setVolume(effectiveGain, resolveSpeakerSource(source));
    }

    function applySpeakerLevelToRoom(targetRoom: Room | null) {
        if (!targetRoom) return;
        targetRoom.remoteParticipants.forEach((participant) => {
            applySpeakerLevelToParticipant(
                participant as unknown as Participant,
                Track.Source.Microphone
            );
            applySpeakerLevelToParticipant(
                participant as unknown as Participant,
                Track.Source.ScreenShareAudio
            );
        });
    }

    function handleRemoteTrackSubscribed(
        track: Track,
        participant: Participant | null | undefined,
        source?: Track.Source
    ) {
        if (track.kind !== Track.Kind.Audio) return;
        const remoteTrack = track as unknown as RemoteAudioTrackLike;
        const participantId = normalizeParticipantId(participant);
        try {
            // Detach first so repeated subscriptions do not accumulate extra audio elements.
            remoteTrack.detach();
            remoteTrack.attach();
        } catch (error) {
            warn("[voice] failed to attach remote audio track", error);
        }
        if (participantId) {
            // Warm the override cache so rejoining restores any stored per-user volume immediately.
            getParticipantVolume(participantId);
        }
        applySpeakerLevelToParticipant(participant, source);
    }

    function handleRemoteTrackUnsubscribed(
        track: Track,
        _participant?: Participant | null | undefined
    ) {
        if (track.kind !== Track.Kind.Audio) return;
        const remoteTrack = track as unknown as RemoteAudioTrackLike;
        try {
            remoteTrack.detach();
        } catch {
            // ignore detach failures
        }
    }

    function setSpeakerLevel(levelPercent: number, targetRoom: Room | null) {
        speakerLevelPercent = normalizeVoiceLevelPercent(levelPercent);
        writeStoredVoiceLevel(SPEAKER_LEVEL_STORAGE_KEY, speakerLevelPercent);
        applySpeakerLevelToRoom(targetRoom);
    }

    function getSpeakerLevel(): number {
        return speakerLevelPercent;
    }

    function setParticipantVolume(userId: string, levelPercent: number) {
        const normalizedUserId = userId.trim();
        if (!normalizedUserId) return;
        const normalizedLevel = normalizeParticipantVolumePercent(levelPercent);
        writeStoredParticipantVolume(normalizedUserId, normalizedLevel);
        if (normalizedLevel === DEFAULT_PARTICIPANT_VOLUME_PERCENT) {
            participantVolumes.delete(normalizedUserId);
            return;
        }
        participantVolumes.set(normalizedUserId, normalizedLevel);
    }

    function getParticipantVolume(userId: string): number {
        const normalizedUserId = userId.trim();
        if (!normalizedUserId) return DEFAULT_PARTICIPANT_VOLUME_PERCENT;
        const cached = participantVolumes.get(normalizedUserId);
        if (cached !== undefined) return cached;
        const stored = readStoredParticipantVolume(normalizedUserId, DEFAULT_PARTICIPANT_VOLUME_PERCENT);
        if (stored !== DEFAULT_PARTICIPANT_VOLUME_PERCENT) {
            participantVolumes.set(normalizedUserId, stored);
        }
        return stored;
    }

    function reset() {
        participantVolumes.clear();
    }

    return {
        getSpeakerLevel,
        getParticipantVolume,
        setSpeakerLevel,
        setParticipantVolume,
        applySpeakerLevelToParticipant,
        applySpeakerLevelToRoom,
        handleRemoteTrackSubscribed,
        handleRemoteTrackUnsubscribed,
        reset,
    };
}
