/**
 * Join and leave notification tones synthesized with the Web Audio API.
 *
 * Used by: livekit.ts to mirror connection and disconnect lifecycle events.
 */
// --- Join/leave/screen-share tone synthesis parameters ---
const JOIN_TONE_FREQUENCY_HZ = 880;
const LEAVE_TONE_FREQUENCY_HZ = 440;
const SCREEN_SHARE_START_TONE_FREQUENCY_HZ = 660;
const SCREEN_SHARE_STOP_TONE_FREQUENCY_HZ = 330;
const TONE_DURATION_MS = 180;
const TONE_PEAK_GAIN = 0.08;
const MS_PER_SECOND = 1000;
const TONE_INITIAL_GAIN = 0.001;
const TONE_RAMP_UP_SECONDS = 0.01;
const TONE_FINAL_GAIN = 0.0001;

function playVoiceTone(frequency: number) {
    if (typeof window === "undefined") return;
    const AudioCtx =
        (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const durationSeconds = TONE_DURATION_MS / MS_PER_SECOND;

    osc.type = "sine";
    osc.frequency.value = frequency;

    // Use a short envelope so the tone feels like a UI cue instead of a hard click.
    gain.gain.setValueAtTime(TONE_INITIAL_GAIN, now);
    gain.gain.exponentialRampToValueAtTime(TONE_PEAK_GAIN, now + TONE_RAMP_UP_SECONDS);
    gain.gain.exponentialRampToValueAtTime(TONE_FINAL_GAIN, now + durationSeconds);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(now + durationSeconds);
    osc.onended = () => {
        ctx.close().catch(() => { });
    };
}

/** Play the higher-pitched join tone after voice connects. */
export function playJoinSound() {
    playVoiceTone(JOIN_TONE_FREQUENCY_HZ);
}

/** Play the lower-pitched leave tone after voice disconnects. */
export function playLeaveSound() {
    playVoiceTone(LEAVE_TONE_FREQUENCY_HZ);
}

/** Play the screen-share start tone. */
export function playScreenShareStartSound() {
    playVoiceTone(SCREEN_SHARE_START_TONE_FREQUENCY_HZ);
}

/** Play the screen-share stop tone. */
export function playScreenShareStopSound() {
    playVoiceTone(SCREEN_SHARE_STOP_TONE_FREQUENCY_HZ);
}
