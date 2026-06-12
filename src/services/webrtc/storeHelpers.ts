import { useAppStore } from "~/stores/app";
import { InputSensitivityMode, NoiseCancellationMethod, type VoiceProcessingSettings } from "@/src/services/webrtc/inputHandler";
import { normalizeInputSensitivityThreshold } from "@/src/services/webrtc/utils";

/**
 * Small store access helpers used by the voice subsystem.
 *
 * Used by: livekit, latency, speaking, and settings-related helpers.
 * Depends on: the Pinia app store voice state.
 */
/** Update the current voice latency value shown in the UI. */
export function setVoiceLatencyMs(value: number | null) {
    const app = useAppStore();
    app.setVoiceLatencyMs(value);
}

/** Replace the list of user ids currently marked as speaking. */
export function setSpeakingUsers(userIds: string[]) {
    const app = useAppStore();
    app.setSpeakingUsers(userIds);
}

/** Clear all speaking indicators from the store. */
export function clearSpeakingUsers() {
    const app = useAppStore();
    app.clearSpeakingUsers();
}

/** Return whether the local user is currently deafened. */
export function isLocallyDeafened(): boolean {
    const app = useAppStore();
    return app.voiceDeafened === true;
}

/** Return whether the local user should be treated as muted for publishing logic. */
export function isLocallyMuted(): boolean {
    const app = useAppStore();
    return app.voiceMuted === true || app.voiceDeafened === true;
}

/** Read voice processing settings with normalized defaults. */
export function getVoiceProcessingSettings(): VoiceProcessingSettings {
    const app = useAppStore();
    const settings = app.voiceProcessingSettings;
    return {
        noiseCancellationMethod: settings?.noiseCancellationMethod === NoiseCancellationMethod.Krisp ? NoiseCancellationMethod.Krisp : NoiseCancellationMethod.WebRTC,
        inputSensitivityMode: settings?.inputSensitivityMode === InputSensitivityMode.Manual ? InputSensitivityMode.Manual : InputSensitivityMode.Auto,
        inputSensitivityThreshold: normalizeInputSensitivityThreshold(settings?.inputSensitivityThreshold ?? Number.NaN),
    };
}

/** Return the local user id used for speaking indicator merging. */
export function localUserId(): string {
    const app = useAppStore();
    return app.userId?.trim() ?? "";
}

/** Persist the latest voice connection error message to the store. */
export function setVoiceError(error: string | null) {
    const app = useAppStore();
    app.setVoiceError(error);
}
