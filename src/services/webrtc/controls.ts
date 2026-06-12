import {
    LocalAudioTrack,
    Room,
    Track,
} from "livekit-client";
import type { Participant } from "livekit-client";
import {
    DEFAULT_VOICE_DEVICE_ID,
    setPreferredVoiceDeviceId,
    supportsSpeakerSelection,
} from "@/src/services/webrtc/devices";
import type {
    VoiceInputMeterState,
    VoiceInputSensitivityMode,
    VoiceProcessingSettings,
} from "@/src/services/webrtc/inputHandler";

/**
 * Voice control helpers for mute, deafen, device switching, and level changes.
 *
 * Coordinates LiveKit participant APIs with the input/output handler modules.
 * Used by: livekit.ts.
 */
type VoiceInputController = {
    setMicrophoneEnabled: (enabled: boolean) => void;
    queueApply: () => void;
    setInputSensitivitySettings: (mode: VoiceInputSensitivityMode, thresholdPercent: number) => void;
    subscribeInputMeter: (listener: (state: VoiceInputMeterState) => void) => () => void;
    applyVoiceProcessingSettings: (settings: VoiceProcessingSettings) => Promise<boolean>;
};

type VoiceOutputController = {
    handleRemoteTrackSubscribed: (
        track: Track,
        participant?: Participant,
        source?: Track.Source,
    ) => void;
    handleRemoteTrackUnsubscribed: (track: Track, participant?: Participant) => void;
    applySpeakerLevelToRoom: (targetRoom: Room) => void;
    applySpeakerLevelToParticipant: (participant: Participant, source?: Track.Source) => void;
    getParticipantVolume: (userId: string) => number;
    setParticipantVolume: (userId: string, levelPercent: number) => void;
    setSpeakerLevel: (levelPercent: number, targetRoom: Room | null) => void;
};

type VoiceControlsDeps = {
    getRoom: () => Room | null;
    getAudioTrack: () => LocalAudioTrack | null;
    setAudioTrack: (track: LocalAudioTrack | null) => void;
    voiceInputHandler: VoiceInputController;
    voiceOutputHandler: VoiceOutputController;
    isLocallyMuted: () => boolean;
    getVoiceProcessingSettings: () => VoiceProcessingSettings;
    warn: (message: string, error?: unknown) => void;
};

function getMicrophonePublication(targetRoom: Room | null) {
    if (!targetRoom) return null;
    return targetRoom.localParticipant.getTrackPublication(Track.Source.Microphone) ?? null;
}

function findParticipantByIdentity(targetRoom: Room, userId: string): Participant | null {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) return null;
    const direct = targetRoom.remoteParticipants.get(normalizedUserId);
    if (direct) return direct as unknown as Participant;
    for (const participant of targetRoom.remoteParticipants.values()) {
        if ((participant.identity ?? "").trim() === normalizedUserId) {
            return participant as unknown as Participant;
        }
    }
    return null;
}

/** Build the control surface used by the voice lifecycle module and settings UI. */
export function createVoiceControls(deps: VoiceControlsDeps) {
    function detachTrackMedia(track: { detach: () => HTMLMediaElement[] } | null | undefined) {
        if (!track) return;
        try {
            track.detach();
        } catch {
            // ignore
        }
    }

    function detachRemoteAudioTracks(targetRoom: Room | null) {
        if (!targetRoom) return;
        targetRoom.remoteParticipants.forEach((participant) => {
            participant.trackPublications.forEach((publication) => {
                const track = publication.track;
                if (track?.kind !== Track.Kind.Audio) return;
                deps.voiceOutputHandler.handleRemoteTrackUnsubscribed(
                    track,
                    participant as unknown as Participant
                );
            });
        });
    }

    function setRemoteAudioSubscribed(targetRoom: Room | null, subscribed: boolean) {
        if (!targetRoom) return;
        targetRoom.remoteParticipants.forEach((participant) => {
            participant.trackPublications.forEach((publication) => {
                if (publication.kind !== Track.Kind.Audio) return;
                const isScreenShareAudio = publication.source === Track.Source.ScreenShareAudio;
                // Screen-share audio is opt-in controlled by livekit.ts subscription policy.
                // Deafen still force-unsubscribes every remote audio track.
                if (subscribed && isScreenShareAudio) return;
                try {
                    publication.setSubscribed(subscribed);
                } catch (err) {
                    deps.warn("[voice] remote audio subscription toggle failed", err);
                }
                const track = publication.track;
                if (!track || track.kind !== Track.Kind.Audio) return;
                if (subscribed) {
                    // Re-attachment is driven by the SDK TrackSubscribed event to avoid duplicates.
                    return;
                }
                deps.voiceOutputHandler.handleRemoteTrackUnsubscribed(
                    track,
                    participant as unknown as Participant
                );
            });
        });
    }

    async function setLocalMicrophoneEnabled(enabled: boolean) {
        deps.voiceInputHandler.setMicrophoneEnabled(enabled);

        const currentRoom = deps.getRoom();
        if (!currentRoom) {
            const track = deps.getAudioTrack();
            if (track) {
                try {
                    track.mediaStreamTrack.enabled = enabled;
                } catch {
                    // ignore track enabled toggle failures
                }
                try {
                    if (enabled) await track.unmute();
                    else await track.mute();
                } catch {
                    // ignore mute fallback failures
                }
            }
            return;
        }

        const previousTrack = deps.getAudioTrack();
        const applyMediaTrackEnabled = (targetTrack: LocalAudioTrack | null | undefined) => {
            if (!targetTrack) return;
            try {
                targetTrack.mediaStreamTrack.enabled = enabled;
            } catch {
                // ignore track enabled toggle failures
            }
        };
        const cleanupPreviousTrackIfReplaced = (
            currentTrack: LocalAudioTrack | null | undefined
        ) => {
            if (!previousTrack || !currentTrack || previousTrack === currentTrack) return;
            // LiveKit may replace the track object during mute/unmute or device changes.
            try {
                detachTrackMedia(previousTrack);
                previousTrack.stop();
            } catch {
                // ignore cleanup failures
            }
        };

        try {
            const publication = await currentRoom.localParticipant.setMicrophoneEnabled(enabled);
            const currentPublication = publication ?? getMicrophonePublication(currentRoom);
            const currentTrack = currentPublication?.audioTrack ?? deps.getAudioTrack();

            if (currentPublication?.audioTrack) {
                deps.setAudioTrack(currentPublication.audioTrack);
            }

            if (enabled) {
                if (currentPublication) await currentPublication.unmute();
                if (currentTrack) {
                    await currentTrack.unmute();
                    deps.setAudioTrack(currentTrack);
                    cleanupPreviousTrackIfReplaced(currentTrack);
                }
                applyMediaTrackEnabled(currentTrack);
                deps.voiceInputHandler.queueApply();
                return;
            }

            if (currentPublication) await currentPublication.mute();
            if (currentTrack) {
                await currentTrack.mute();
                deps.setAudioTrack(currentTrack);
                cleanupPreviousTrackIfReplaced(currentTrack);
            }
            applyMediaTrackEnabled(currentTrack);
        } catch (err) {
            deps.warn("[voice] mute toggle failed", err);
            const fallbackPublication = getMicrophonePublication(currentRoom);
            const fallbackTrack = fallbackPublication?.audioTrack ?? deps.getAudioTrack();
            applyMediaTrackEnabled(fallbackTrack);
            if (!fallbackTrack) {
                deps.voiceInputHandler.queueApply();
                return;
            }
            try {
                if (enabled) await fallbackTrack.unmute();
                else await fallbackTrack.mute();
                deps.setAudioTrack(fallbackTrack);
                cleanupPreviousTrackIfReplaced(fallbackTrack);
            } catch {
                // ignore mute fallback failures
            }
        }
        deps.voiceInputHandler.queueApply();
    }

    async function setMicrophoneMuted(muted: boolean) {
        await setLocalMicrophoneEnabled(!muted);
    }

    async function setPreferredMicrophoneDevice(deviceId: string): Promise<boolean> {
        const normalizedDeviceId = deviceId.trim() || DEFAULT_VOICE_DEVICE_ID;
        const currentRoom = deps.getRoom();
        if (!currentRoom) {
            setPreferredVoiceDeviceId("audioinput", normalizedDeviceId);
            return false;
        }

        await currentRoom.switchActiveDevice("audioinput", normalizedDeviceId);
        const currentPublication = getMicrophonePublication(currentRoom);
        if (currentPublication?.audioTrack) {
            deps.setAudioTrack(currentPublication.audioTrack);
            deps.voiceInputHandler.queueApply();
            deps.voiceInputHandler.setMicrophoneEnabled(!deps.isLocallyMuted());
        }
        setPreferredVoiceDeviceId("audioinput", normalizedDeviceId);
        return true;
    }

    async function setPreferredSpeakerDevice(deviceId: string): Promise<boolean> {
        const normalizedDeviceId = deviceId.trim() || DEFAULT_VOICE_DEVICE_ID;
        if (!supportsSpeakerSelection()) {
            throw new Error("Speaker selection is not supported in this browser");
        }
        const currentRoom = deps.getRoom();
        if (!currentRoom) {
            setPreferredVoiceDeviceId("audiooutput", normalizedDeviceId);
            return false;
        }

        await currentRoom.switchActiveDevice("audiooutput", normalizedDeviceId);
        deps.voiceOutputHandler.applySpeakerLevelToRoom(currentRoom);
        setPreferredVoiceDeviceId("audiooutput", normalizedDeviceId);
        return true;
    }

    function setSpeakerLevel(levelPercent: number) {
        deps.voiceOutputHandler.setSpeakerLevel(levelPercent, deps.getRoom());
    }

    function setParticipantVolume(userId: string, levelPercent: number) {
        deps.voiceOutputHandler.setParticipantVolume(userId, levelPercent);
        const currentRoom = deps.getRoom();
        if (!currentRoom) return;
        const participant = findParticipantByIdentity(currentRoom, userId);
        if (!participant) return;
        deps.voiceOutputHandler.applySpeakerLevelToParticipant(participant);
    }

    function setInputSensitivitySettings(mode: VoiceInputSensitivityMode, thresholdPercent: number) {
        deps.voiceInputHandler.setInputSensitivitySettings(mode, thresholdPercent);
    }

    function subscribeVoiceInputMeter(listener: (state: VoiceInputMeterState) => void): () => void {
        return deps.voiceInputHandler.subscribeInputMeter(listener);
    }

    function applyVoiceProcessingSettings(): Promise<boolean> {
        deps.voiceInputHandler.setMicrophoneEnabled(!deps.isLocallyMuted());
        const currentPublication = getMicrophonePublication(deps.getRoom());
        if (currentPublication?.audioTrack) {
            deps.setAudioTrack(currentPublication.audioTrack);
        }
        return deps.voiceInputHandler.applyVoiceProcessingSettings(deps.getVoiceProcessingSettings());
    }

    function setDeafened(deafened: boolean) {
        setRemoteAudioSubscribed(deps.getRoom(), !deafened);
    }

    async function muteSelf() {
        await setLocalMicrophoneEnabled(false);
    }

    async function unmuteSelf() {
        await setLocalMicrophoneEnabled(true);
    }

    async function deafenSelf() {
        await setLocalMicrophoneEnabled(false);
        setDeafened(true);
    }

    async function undeafenSelf() {
        setDeafened(false);
        await setLocalMicrophoneEnabled(true);
    }

    return {
        detachTrackMedia,
        detachRemoteAudioTracks,
        setRemoteAudioSubscribed,
        setLocalMicrophoneEnabled,
        setMicrophoneMuted,
        setPreferredMicrophoneDevice,
        setPreferredSpeakerDevice,
        setSpeakerLevel,
        setParticipantVolume,
        setInputSensitivitySettings,
        subscribeVoiceInputMeter,
        applyVoiceProcessingSettings,
        setDeafened,
        muteSelf,
        unmuteSelf,
        deafenSelf,
        undeafenSelf,
    };
}
