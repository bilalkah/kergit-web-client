/**
 * Shared utilities for promise timeouts, persisted voice levels, and numeric helpers.
 *
 * Used by: livekit, inputHandler, outputHandler, latency, and storeHelpers.
 * Used from: composables/useWebSocket.ts via the live voice control surface.
 */

/** Default manual threshold used when no stored input sensitivity exists. */
export const DEFAULT_INPUT_SENSITIVITY_THRESHOLD = 42;
/** Default per-participant speaker level when no override is stored. */
export const DEFAULT_PARTICIPANT_VOLUME_PERCENT = 100;

// --- Voice level normalization and per-user volume storage ---
const DEFAULT_VOICE_LEVEL_PERCENT = 100;
const MAX_PARTICIPANT_VOLUME_PERCENT = 200;
const VOICE_LEVEL_PERCENT_DIVISOR = 100;
const PARTICIPANT_VOLUME_STORAGE_KEY_PREFIX = "kergit:voice:user-volume:";
const DECIMAL_RADIX = 10;
const MIN_INPUT_SENSITIVITY_THRESHOLD = 0;
const MAX_INPUT_SENSITIVITY_THRESHOLD = 100;

/** Reject a promise if it does not settle within the provided timeout. */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(message));
        }, timeoutMs);

        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            },
        );
    });
}

/** Clamp a voice level percent into the supported 0-100 range. */
export function normalizeVoiceLevelPercent(value: number): number {
    if (!Number.isFinite(value)) return DEFAULT_VOICE_LEVEL_PERCENT;
    const clamped = Math.max(0, Math.min(DEFAULT_VOICE_LEVEL_PERCENT, value));
    return Math.round(clamped);
}

/** Convert a 0-100 voice level into a GainNode-compatible multiplier. */
export function voiceLevelToGain(value: number): number {
    return normalizeVoiceLevelPercent(value) / VOICE_LEVEL_PERCENT_DIVISOR;
}

/** Clamp a per-participant speaker level into the supported 0-200 range. */
export function normalizeParticipantVolumePercent(value: number): number {
    if (!Number.isFinite(value)) return DEFAULT_PARTICIPANT_VOLUME_PERCENT;
    const clamped = Math.max(0, Math.min(MAX_PARTICIPANT_VOLUME_PERCENT, value));
    return Math.round(clamped);
}

/** Clamp microphone input sensitivity threshold into the supported 0-100 range. */
export function normalizeInputSensitivityThreshold(value: number): number {
    if (!Number.isFinite(value)) return DEFAULT_INPUT_SENSITIVITY_THRESHOLD;
    const clamped = Math.max(MIN_INPUT_SENSITIVITY_THRESHOLD, Math.min(MAX_INPUT_SENSITIVITY_THRESHOLD, value));
    return Math.round(clamped);
}

/** Read a persisted per-participant speaker level from localStorage. */
export function readStoredParticipantVolume(
    userId: string,
    fallback = DEFAULT_PARTICIPANT_VOLUME_PERCENT,
): number {
    if (!import.meta.client) return fallback;
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) return fallback;
    try {
        const raw = window.localStorage.getItem(`${PARTICIPANT_VOLUME_STORAGE_KEY_PREFIX}${normalizedUserId}`);
        const parsed = Number.parseInt(raw ?? "", DECIMAL_RADIX);
        if (!Number.isFinite(parsed)) return fallback;
        return normalizeParticipantVolumePercent(parsed);
    } catch {
        return fallback;
    }
}

/** Persist a per-participant speaker level to localStorage. */
export function writeStoredParticipantVolume(userId: string, value: number) {
    if (!import.meta.client) return;
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) return;
    const normalizedValue = normalizeParticipantVolumePercent(value);
    const storageKey = `${PARTICIPANT_VOLUME_STORAGE_KEY_PREFIX}${normalizedUserId}`;
    try {
        if (normalizedValue === DEFAULT_PARTICIPANT_VOLUME_PERCENT) {
            window.localStorage.removeItem(storageKey);
            return;
        }
        window.localStorage.setItem(storageKey, String(normalizedValue));
    } catch {
        // ignore storage failures
    }
}

/** Read a persisted voice level from localStorage with normalization. */
export function readStoredVoiceLevel(key: string, fallback: number): number {
    if (!import.meta.client) return fallback;
    try {
        const raw = window.localStorage.getItem(key);
        const parsed = Number.parseInt(raw ?? "", DECIMAL_RADIX);
        if (!Number.isFinite(parsed)) return fallback;
        return normalizeVoiceLevelPercent(parsed);
    } catch {
        return fallback;
    }
}

/** Persist a normalized voice level to localStorage. */
export function writeStoredVoiceLevel(key: string, value: number) {
    if (!import.meta.client) return;
    try {
        window.localStorage.setItem(key, String(normalizeVoiceLevelPercent(value)));
    } catch {
        // ignore storage failures
    }
}

/** Return the median of a numeric sample window. */
export { median } from "@/src/utils/math";
