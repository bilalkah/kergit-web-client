/*
 * Voice input note:
 * - Browser echo cancellation, noise suppression, and AGC are capture-track features.
 * - Audio is never routed through Web Audio for publishing; the raw
 *   `createLocalAudioTrack()` capture track stays as the published source.
 * - Metering uses a *cloned* track fed to a Web Audio AnalyserNode so the meter
 *   always reads real mic levels even when the noise gate silences the published track.
 * - The noise gate toggles `mediaStreamTrack.enabled` on the published track.
 *   This sends silence frames without signalling a LiveKit mute, preserving browser
 *   AEC/NS/AGC on the raw capture track.
 */
import type { LocalAudioTrack } from "livekit-client";
import {
    DEFAULT_INPUT_SENSITIVITY_THRESHOLD,
    normalizeInputSensitivityThreshold,
} from "@/src/services/webrtc/utils";
import {
    applyKrispToTrack,
    removeKrispFromTrack,
} from "@/src/services/webrtc/krispProcessor";

/**
 * Local microphone capture helpers, meter state, and browser-level voice settings.
 *
 * Used by: livekit.ts and controls.ts.
 * Depends on: utils.ts for persisted levels and shared normalization helpers.
 */
/** Supported microphone sensitivity modes. */
export enum InputSensitivityMode {
    Auto = 'auto',
    Manual = 'manual',
}

/** @deprecated Use InputSensitivityMode instead. */
export type VoiceInputSensitivityMode = InputSensitivityMode;

/** Supported noise cancellation methods. */
export enum NoiseCancellationMethod {
    WebRTC = 'webrtc',
    Krisp = 'krisp',
}

/** Browser capture settings plus local microphone meter preferences. */
export type VoiceProcessingSettings = {
    noiseCancellationMethod: NoiseCancellationMethod;
    inputSensitivityMode: InputSensitivityMode;
    inputSensitivityThreshold: number;
};

/** Realtime microphone meter state emitted to the settings UI and speaking logic. */
export type VoiceInputMeterState = {
    levelPercent: number;
    thresholdPercent: number;
    mode: VoiceInputSensitivityMode;
    gateOpen: boolean;
};

type VoiceInputHandlerOptions = {
    getTrack: () => LocalAudioTrack | null;
    getPreferredMicrophoneDeviceId?: () => string;
    warn: (message: string, error?: unknown) => void;
};

/** Public control surface returned by createVoiceInputHandler(). */
export type VoiceInputHandler = {
    applyToTrack: (targetTrack: LocalAudioTrack | null) => Promise<void>;
    queueApply: () => void;
    setMicrophoneEnabled: (enabled: boolean) => void;
    setInputSensitivitySettings: (mode: VoiceInputSensitivityMode, thresholdPercent: number) => void;
    subscribeInputMeter: (listener: (state: VoiceInputMeterState) => void) => () => void;
    applyVoiceProcessingSettings: (settings: VoiceProcessingSettings) => Promise<boolean>;
    destroy: () => void;
};

// --- Stored level and automatic noise-floor learning thresholds ---
const AUTO_NOISE_FLOOR_MIN = 2;
const AUTO_NOISE_FLOOR_MAX = 58;
const AUTO_NOISE_FLOOR_RISE_ALPHA = 0.018;
const AUTO_NOISE_FLOOR_FALL_ALPHA = 0.12;
const AUTO_NOISE_FLOOR_LEARN_GUARD = 5;
const AUTO_NOISE_FLOOR_BASELINE_PADDING = 6;
const AUTO_THRESHOLD_OFFSET = 8;
const AUTO_THRESHOLD_MIN = 6;
const AUTO_THRESHOLD_MAX = 66;
// --- Noise gate hysteresis ---
const GATE_OPEN_MARGIN = 1.5;
const GATE_CLOSE_MARGIN = 3.5;
// --- Meter sampling timing ---
const INPUT_ANALYZER_FFT_SIZE = 1024;
const INPUT_ANALYZER_SMOOTHING_TIME = 0.2;
const AUDIO_METER_PCM_CENTER_OFFSET = 128;
const AUDIO_METER_PCM_NORMALIZER = 128;
const AUDIO_LEVEL_PERCENT_SCALE = 460;
const INPUT_LEVEL_PREVIOUS_WEIGHT = 0.72;
const INPUT_LEVEL_CURRENT_WEIGHT = 0.28;
const INPUT_METER_INTERVAL_MS = 50;

/**
 * Local microphone meter and noise gate that gates the published track by
 * toggling `mediaStreamTrack.enabled` based on a learned noise-floor threshold.
 *
 * Metering uses a *cloned* MediaStreamTrack so the AnalyserNode always reads
 * real audio even when the gate silences the published track.
 */
class MicrophoneMeter {
    private publishedTrack: MediaStreamTrack | null = null;
    private clonedMeterTrack: MediaStreamTrack | null = null;
    private sourceNode: MediaStreamAudioSourceNode | null = null;
    private analyserNode: AnalyserNode | null = null;
    private audioContext: AudioContext | null = null;
    private meterBuffer: Uint8Array | null = null;
    private meterTimer: ReturnType<typeof setInterval> | null = null;
    private gateOpen = true;
    private microphoneEnabled = true;
    private inputSensitivityMode: VoiceInputSensitivityMode;
    private inputSensitivityThresholdPercent: number;
    private autoNoiseFloorPercent = AUTO_NOISE_FLOOR_MIN;
    private smoothedLevelPercent = 0;
    private readonly onMeterUpdate: (state: VoiceInputMeterState) => void;

    constructor(
        initialMode: VoiceInputSensitivityMode,
        initialThresholdPercent: number,
        onMeterUpdate: (state: VoiceInputMeterState) => void,
    ) {
        this.inputSensitivityMode = initialMode;
        this.inputSensitivityThresholdPercent = normalizeInputSensitivityThreshold(initialThresholdPercent);
        this.onMeterUpdate = onMeterUpdate;
    }

    setup(track: MediaStreamTrack, context: AudioContext) {
        this.teardown(false);
        this.audioContext = context;
        this.publishedTrack = track;

        // Clone the track so the analyser always sees real audio regardless of gate state.
        this.clonedMeterTrack = track.clone();
        this.sourceNode = context.createMediaStreamSource(new MediaStream([this.clonedMeterTrack]));
        this.analyserNode = context.createAnalyser();
        this.analyserNode.fftSize = INPUT_ANALYZER_FFT_SIZE;
        this.analyserNode.smoothingTimeConstant = INPUT_ANALYZER_SMOOTHING_TIME;
        this.meterBuffer = new Uint8Array(this.analyserNode.fftSize);
        this.sourceNode.connect(this.analyserNode);

        this.startMeterLoop();
    }

    destroy() {
        this.teardown(true);
    }

    setInputSensitivity(mode: VoiceInputSensitivityMode, thresholdPercent: number) {
        this.inputSensitivityMode = mode;
        this.inputSensitivityThresholdPercent = normalizeInputSensitivityThreshold(thresholdPercent);
        if (this.inputSensitivityMode === InputSensitivityMode.Auto) {
            const baseline = Math.max(
                AUTO_NOISE_FLOOR_MIN,
                Math.min(AUTO_NOISE_FLOOR_MAX, this.smoothedLevelPercent),
            );
            this.autoNoiseFloorPercent = Math.min(
                this.autoNoiseFloorPercent,
                baseline + AUTO_NOISE_FLOOR_BASELINE_PADDING,
            );
        }
        this.onMeterUpdate({
            levelPercent: this.smoothedLevelPercent,
            thresholdPercent: this.getEffectiveThresholdPercent(),
            mode: this.inputSensitivityMode,
            gateOpen: this.gateOpen,
        });
    }

    setMicrophoneEnabled(enabled: boolean) {
        this.microphoneEnabled = enabled;
        this.applyGateToTrack();
    }

    private applyGateToTrack() {
        if (!this.publishedTrack) return;
        // When muted by user: always disable. Otherwise honour the gate state.
        this.publishedTrack.enabled = this.microphoneEnabled && this.gateOpen;
    }

    private startMeterLoop() {
        this.stopMeterLoop();

        const tick = () => {
            const analyser = this.analyserNode;
            const buffer = this.meterBuffer;
            if (!analyser || !buffer) return;

            analyser.getByteTimeDomainData(buffer as unknown as Uint8Array<ArrayBuffer>);
            let sumSquares = 0;
            for (let i = 0; i < buffer.length; i += 1) {
                const sample = (
                    (buffer[i] ?? AUDIO_METER_PCM_CENTER_OFFSET) - AUDIO_METER_PCM_CENTER_OFFSET
                ) / AUDIO_METER_PCM_NORMALIZER;
                sumSquares += sample * sample;
            }
            const rms = Math.sqrt(sumSquares / buffer.length);
            const rawPercent = Math.min(100, rms * AUDIO_LEVEL_PERCENT_SCALE);
            this.smoothedLevelPercent = (
                this.smoothedLevelPercent * INPUT_LEVEL_PREVIOUS_WEIGHT
            ) + (
                rawPercent * INPUT_LEVEL_CURRENT_WEIGHT
            );

            this.updateAutoNoiseFloor();
            const thresholdPercent = this.getEffectiveThresholdPercent();
            this.updateGateState(thresholdPercent);

            this.onMeterUpdate({
                levelPercent: Math.round(this.smoothedLevelPercent),
                thresholdPercent: Math.round(thresholdPercent),
                mode: this.inputSensitivityMode,
                gateOpen: this.gateOpen,
            });
        };

        const timer = typeof window !== "undefined" ? window.setInterval : setInterval;
        this.meterTimer = timer(tick, INPUT_METER_INTERVAL_MS);
        tick();
    }

    private stopMeterLoop() {
        if (!this.meterTimer) return;
        clearInterval(this.meterTimer);
        this.meterTimer = null;
    }

    private updateAutoNoiseFloor() {
        if (this.inputSensitivityMode !== InputSensitivityMode.Auto) return;
        const currentThreshold = this.getEffectiveThresholdPercent();
        const learnCutoff = Math.max(0, currentThreshold - AUTO_NOISE_FLOOR_LEARN_GUARD);
        if (this.smoothedLevelPercent > learnCutoff) return;

        const targetFloor = Math.max(
            AUTO_NOISE_FLOOR_MIN,
            Math.min(AUTO_NOISE_FLOOR_MAX, this.smoothedLevelPercent),
        );
        const alpha = targetFloor >= this.autoNoiseFloorPercent
            ? AUTO_NOISE_FLOOR_RISE_ALPHA
            : AUTO_NOISE_FLOOR_FALL_ALPHA;
        this.autoNoiseFloorPercent += (targetFloor - this.autoNoiseFloorPercent) * alpha;
    }

    private getEffectiveThresholdPercent(): number {
        if (this.inputSensitivityMode === InputSensitivityMode.Manual) {
            return this.inputSensitivityThresholdPercent;
        }
        return Math.max(AUTO_THRESHOLD_MIN, Math.min(AUTO_THRESHOLD_MAX, this.autoNoiseFloorPercent + AUTO_THRESHOLD_OFFSET));
    }

    private updateGateState(thresholdPercent: number) {
        const openThreshold = Math.min(100, thresholdPercent + GATE_OPEN_MARGIN);
        const closeThreshold = Math.max(0, thresholdPercent - GATE_CLOSE_MARGIN);

        if (this.gateOpen) {
            if (this.smoothedLevelPercent < closeThreshold) {
                this.gateOpen = false;
            }
        } else if (this.smoothedLevelPercent > openThreshold) {
            this.gateOpen = true;
        }

        this.applyGateToTrack();
    }

    private teardown(stopClone: boolean) {
        this.stopMeterLoop();

        try {
            this.sourceNode?.disconnect();
        } catch {
            // ignore
        }
        try {
            this.analyserNode?.disconnect();
        } catch {
            // ignore
        }

        this.sourceNode = null;
        this.analyserNode = null;
        this.meterBuffer = null;
        this.gateOpen = true;
        this.smoothedLevelPercent = 0;

        if (stopClone && this.clonedMeterTrack) {
            try {
                this.clonedMeterTrack.stop();
            } catch {
                // ignore
            }
        }
        this.clonedMeterTrack = null;
        this.publishedTrack = null;

        this.onMeterUpdate({
            levelPercent: 0,
            thresholdPercent: Math.round(this.getEffectiveThresholdPercent()),
            mode: this.inputSensitivityMode,
            gateOpen: false,
        });
    }
}

function resolveAudioContextCtor(): (new () => AudioContext) | null {
    if (!import.meta.client || typeof window === "undefined") return null;
    const ctor = (window as unknown as { AudioContext?: new () => AudioContext; webkitAudioContext?: new () => AudioContext }).AudioContext
        ?? (window as unknown as { webkitAudioContext?: new () => AudioContext }).webkitAudioContext;
    return ctor ?? null;
}

/** Create the microphone handler that owns local audio processing and metering. */
export function createVoiceInputHandler(options: VoiceInputHandlerOptions): VoiceInputHandler {
    const { getTrack, getPreferredMicrophoneDeviceId, warn } = options;
    let meterAudioContext: AudioContext | null = null;
    let meter: MicrophoneMeter | null = null;
    let meterSourceTrack: MediaStreamTrack | null = null;
    let applyInFlight = false;
    let applyPending = false;
    let voiceProcessingApplyPromise: Promise<boolean> | null = null;
    let pendingVoiceProcessingSettings: VoiceProcessingSettings | null = null;
    let microphoneEnabled = true;
    let inputSensitivityMode: VoiceInputSensitivityMode = InputSensitivityMode.Auto;
    let inputSensitivityThresholdPercent = DEFAULT_INPUT_SENSITIVITY_THRESHOLD;
    let inputMeterState: VoiceInputMeterState = {
        levelPercent: 0,
        thresholdPercent: DEFAULT_INPUT_SENSITIVITY_THRESHOLD,
        mode: InputSensitivityMode.Auto,
        gateOpen: false,
    };
    const inputMeterListeners = new Set<(state: VoiceInputMeterState) => void>();

    const emitInputMeterState = (state: VoiceInputMeterState) => {
        inputMeterState = {
            levelPercent: normalizeInputSensitivityThreshold(state.levelPercent),
            thresholdPercent: normalizeInputSensitivityThreshold(state.thresholdPercent),
            mode: state.mode,
            gateOpen: state.gateOpen === true,
        };
        inputMeterListeners.forEach((listener) => {
            try {
                listener(inputMeterState);
            } catch {
                // ignore listener errors
            }
        });
    };

    function getMeterAudioContext(): AudioContext | null {
        if (meterAudioContext && meterAudioContext.state !== "closed") {
            return meterAudioContext;
        }
        const AudioContextCtor = resolveAudioContextCtor();
        if (!AudioContextCtor) return null;
        try {
            meterAudioContext = new AudioContextCtor();
            return meterAudioContext;
        } catch {
            return null;
        }
    }

    function setInputSensitivitySettings(mode: VoiceInputSensitivityMode, thresholdPercent: number) {
        inputSensitivityMode = mode === InputSensitivityMode.Manual ? InputSensitivityMode.Manual : InputSensitivityMode.Auto;
        inputSensitivityThresholdPercent = normalizeInputSensitivityThreshold(thresholdPercent);
        meter?.setInputSensitivity(inputSensitivityMode, inputSensitivityThresholdPercent);
        emitInputMeterState({
            levelPercent: inputMeterState.levelPercent,
            thresholdPercent: inputSensitivityMode === InputSensitivityMode.Manual
                ? inputSensitivityThresholdPercent
                : DEFAULT_INPUT_SENSITIVITY_THRESHOLD,
            mode: inputSensitivityMode,
            gateOpen: inputMeterState.gateOpen,
        });
    }

    function subscribeInputMeter(listener: (state: VoiceInputMeterState) => void) {
        inputMeterListeners.add(listener);
        listener(inputMeterState);
        return () => {
            inputMeterListeners.delete(listener);
        };
    }

    async function applyToTrack(targetTrack: LocalAudioTrack | null) {
        if (!targetTrack) {
            emitInputMeterState({
                levelPercent: 0,
                thresholdPercent: inputSensitivityMode === InputSensitivityMode.Manual
                    ? inputSensitivityThresholdPercent
                    : DEFAULT_INPUT_SENSITIVITY_THRESHOLD,
                mode: inputSensitivityMode,
                gateOpen: false,
            });
            return;
        }

        const context = getMeterAudioContext();
        if (context) {
            if (context.state === "suspended") {
                try {
                    await context.resume();
                } catch {
                    // ignore resume failures
                }
            }
            try {
                if (!meter) {
                    meter = new MicrophoneMeter(
                        inputSensitivityMode,
                        inputSensitivityThresholdPercent,
                        emitInputMeterState,
                    );
                }
                if (meterSourceTrack !== targetTrack.mediaStreamTrack) {
                    meter.setup(targetTrack.mediaStreamTrack, context);
                    meterSourceTrack = targetTrack.mediaStreamTrack;
                }
                meter.setInputSensitivity(inputSensitivityMode, inputSensitivityThresholdPercent);
                meter.setMicrophoneEnabled(microphoneEnabled);
                return;
            } catch (err) {
                warn("[voice] microphone meter unavailable", err);
                meterSourceTrack = null;
            }
        }

        // Fallback: no meter available, just honour mute state directly.
        try {
            targetTrack.mediaStreamTrack.enabled = microphoneEnabled;
        } catch {
            // ignore
        }
        emitInputMeterState({
            levelPercent: 0,
            thresholdPercent: inputSensitivityMode === InputSensitivityMode.Manual
                ? inputSensitivityThresholdPercent
                : DEFAULT_INPUT_SENSITIVITY_THRESHOLD,
            mode: inputSensitivityMode,
            gateOpen: false,
        });
    }

    function queueApply() {
        applyPending = true;
        if (applyInFlight) return;
        applyInFlight = true;
        void (async () => {
            while (applyPending) {
                applyPending = false;
                await applyToTrack(getTrack());
            }
            applyInFlight = false;
        })();
    }

    function setMicrophoneEnabled(enabled: boolean) {
        microphoneEnabled = enabled;
        meter?.setMicrophoneEnabled(microphoneEnabled);
        // Also directly toggle in case meter hasn't been set up yet.
        const targetTrack = getTrack();
        if (targetTrack && !meter) {
            try {
                targetTrack.mediaStreamTrack.enabled = microphoneEnabled;
            } catch {
                // ignore
            }
        }
        queueApply();
    }

    async function resolveCurrentDeviceId(targetTrack: LocalAudioTrack): Promise<string | undefined> {
        const settingsDeviceId = targetTrack.mediaStreamTrack.getSettings().deviceId;
        if (typeof settingsDeviceId === "string" && settingsDeviceId.trim()) {
            return settingsDeviceId.trim();
        }
        try {
            const trackDeviceId = await targetTrack.getDeviceId(false);
            const normalized = trackDeviceId?.trim();
            if (normalized) return normalized;
        } catch {
            // ignore and continue without explicit device id
        }
        return undefined;
    }

    async function restartTrackWithVoiceProcessing(
        targetTrack: LocalAudioTrack,
        settings: VoiceProcessingSettings
    ) {
        const useKrisp = settings.noiseCancellationMethod === NoiseCancellationMethod.Krisp;
        // When Krisp handles noise cancellation, disable WebRTC noiseSuppression
        // to avoid double-processing. Echo cancellation stays on per LiveKit docs.
        const effectiveNoiseSuppression = !useKrisp;
        const effectiveVoiceIsolation = !useKrisp;

        const currentDeviceId = await resolveCurrentDeviceId(targetTrack);
        const preferredDeviceId = getPreferredMicrophoneDeviceId?.().trim() ?? "";

        const candidateDeviceIds = Array.from(
            new Set(
                [currentDeviceId, preferredDeviceId]
                    .map((value) => value?.trim() ?? "")
                    .filter((value) => value.length > 0 && value !== "default")
            )
        );

        for (const deviceId of candidateDeviceIds) {
            try {
                await targetTrack.restartTrack({
                    echoCancellation: true,
                    noiseSuppression: effectiveNoiseSuppression,
                    autoGainControl: true,
                    voiceIsolation: effectiveVoiceIsolation,
                    deviceId,
                });
                if (useKrisp) {
                    await applyKrispToTrack(targetTrack);
                } else {
                    await removeKrispFromTrack(targetTrack);
                }
                return;
            } catch (err) {
                warn("[voice] failed to restart mic with explicit device id, retrying fallback", err);
            }
        }

        await targetTrack.restartTrack({
            echoCancellation: true,
            noiseSuppression: effectiveNoiseSuppression,
            autoGainControl: true,
            voiceIsolation: effectiveVoiceIsolation,
        });
        if (useKrisp) {
            await applyKrispToTrack(targetTrack);
        } else {
            await removeKrispFromTrack(targetTrack);
        }
    }

    async function applyVoiceProcessingToTrack(settings: VoiceProcessingSettings): Promise<boolean> {
        const targetTrack = getTrack();
        if (!targetTrack) {
            setInputSensitivitySettings(settings.inputSensitivityMode, settings.inputSensitivityThreshold);
            return false;
        }
        try {
            setInputSensitivitySettings(settings.inputSensitivityMode, settings.inputSensitivityThreshold);
            await restartTrackWithVoiceProcessing(targetTrack, settings);
            queueApply();
            return true;
        } catch (err) {
            warn('[voice] failed to apply voice processing settings', err);
            return false;
        }
    }

    function applyVoiceProcessingSettings(settings: VoiceProcessingSettings): Promise<boolean> {
        pendingVoiceProcessingSettings = {
            noiseCancellationMethod: settings.noiseCancellationMethod,
            inputSensitivityMode: settings.inputSensitivityMode,
            inputSensitivityThreshold: normalizeInputSensitivityThreshold(settings.inputSensitivityThreshold),
        };
        if (voiceProcessingApplyPromise) {
            return voiceProcessingApplyPromise;
        }

        voiceProcessingApplyPromise = (async () => {
            let applied = false;
            try {
                while (pendingVoiceProcessingSettings) {
                    const nextSettings = pendingVoiceProcessingSettings;
                    pendingVoiceProcessingSettings = null;
                    const appliedNow = await applyVoiceProcessingToTrack(nextSettings);
                    if (appliedNow) {
                        applied = true;
                    }
                }
                return applied;
            } finally {
                voiceProcessingApplyPromise = null;
            }
        })();

        return voiceProcessingApplyPromise;
    }

    function destroy() {
        if (meter) {
            meter.destroy();
            meter = null;
        }
        meterSourceTrack = null;
        if (meterAudioContext && meterAudioContext.state !== "closed") {
            void meterAudioContext.close().catch(() => {
                // ignore audio context close failures
            });
        }
        meterAudioContext = null;
        emitInputMeterState({
            levelPercent: 0,
            thresholdPercent: inputSensitivityMode === InputSensitivityMode.Manual
                ? inputSensitivityThresholdPercent
                : DEFAULT_INPUT_SENSITIVITY_THRESHOLD,
            mode: inputSensitivityMode,
            gateOpen: false,
        });
    }

    return {
        applyToTrack,
        queueApply,
        setMicrophoneEnabled,
        setInputSensitivitySettings,
        subscribeInputMeter,
        applyVoiceProcessingSettings,
        destroy,
    };
}
