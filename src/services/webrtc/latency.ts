import type { LocalAudioTrack } from "livekit-client";
import { setVoiceLatencyMs } from "@/src/services/webrtc/storeHelpers";
import { median } from "@/src/services/webrtc/utils";
import { devLog } from "@/src/utils/safeLogger";

/**
 * Voice latency sampling based on public LiveKit local-track stats.
 *
 * Used by: livekit.ts while a room is connected.
 * Depends on: storeHelpers.ts for publishing RTT into the app store.
 */
const LATENCY_WINDOW_SIZE = 8;
const MAX_CONSECUTIVE_MISSING_SAMPLES = 10;
const LATENCY_POLL_INTERVAL_MS = 2000;
const LATENCY_EMA_ALPHA = 0.25;
const MAX_VALID_RTT_MS = 5000;
const RTT_SECONDS_TO_MILLISECONDS_THRESHOLD = 5;
const MILLISECONDS_PER_SECOND = 1000;

type LatencyState = {
    timer: ReturnType<typeof setInterval> | null;
    emaMs: number | null;
    window: number[];
    missingSamples: number;
};

const state: LatencyState = {
    timer: null,
    emaMs: null,
    window: [],
    missingSamples: 0,
};

function normalizeRttToMs(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return 0;
    if (value < RTT_SECONDS_TO_MILLISECONDS_THRESHOLD) {
        return Math.round(value * MILLISECONDS_PER_SECOND);
    }
    return Math.round(value);
}

function pushLatencySample(value: number): number {
    state.window.push(value);
    if (state.window.length > LATENCY_WINDOW_SIZE) {
        state.window.shift();
    }
    return median(state.window);
}

function extractRttFromRtcReport(report: RTCStatsReport | undefined): number | null {
    if (!report) return null;

    const entries: Array<Record<string, unknown>> = [];
    report.forEach((value) => {
        if (value && typeof value === "object") {
            entries.push(value as Record<string, unknown>);
        }
    });

    if (entries.length === 0) return null;

    const byId = new Map<string, Record<string, unknown>>();
    for (const entry of entries) {
        const id = entry.id;
        if (typeof id === "string" && id) byId.set(id, entry);
    }

    const rtts: number[] = [];
    const pushRtt = (entry: Record<string, unknown>) => {
        const raw = entry.currentRoundTripTime ?? entry.roundTripTime;
        if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
            rtts.push(raw);
        }
    };

    for (const entry of entries) {
        if (entry.type !== "transport") continue;
        const pairId = entry.selectedCandidatePairId;
        if (typeof pairId !== "string" || !pairId) continue;
        const pair = byId.get(pairId);
        if (!pair || pair.type !== "candidate-pair") continue;
        if (pair.state && pair.state !== "succeeded") continue;
        pushRtt(pair);
    }

    if (rtts.length > 0) return median(rtts);

    for (const entry of entries) {
        if (entry.type !== "candidate-pair") continue;
        const stateValue = entry.state;
        if (typeof stateValue === "string" && stateValue !== "succeeded") continue;
        const nominated = entry.nominated === true;
        const selected = entry.selected === true;
        if (!nominated && !selected && stateValue !== "succeeded") continue;
        pushRtt(entry);
    }

    return rtts.length > 0 ? median(rtts) : null;
}

async function readTrackRttSeconds(track: LocalAudioTrack): Promise<number | null> {
    const senderStats = await track.getSenderStats();
    if (typeof senderStats?.roundTripTime === "number" && senderStats.roundTripTime > 0) {
        return senderStats.roundTripTime;
    }

    const report = await track.getRTCStatsReport();
    return extractRttFromRtcReport(report);
}

function publishMissingSample() {
    state.missingSamples += 1;
    if (state.emaMs !== null && state.missingSamples <= MAX_CONSECUTIVE_MISSING_SAMPLES) {
        setVoiceLatencyMs(state.emaMs);
        return;
    }
    setVoiceLatencyMs(null);
}

async function sampleLatency(getLocalTrack: () => LocalAudioTrack | null) {
    try {
        const localTrack = getLocalTrack();
        if (!localTrack) {
            publishMissingSample();
            return;
        }

        const rttSeconds = await readTrackRttSeconds(localTrack);
        if (!rttSeconds) {
            publishMissingSample();
            return;
        }

        const rawMs = normalizeRttToMs(rttSeconds);
        if (rawMs <= 0 || rawMs > MAX_VALID_RTT_MS) {
            publishMissingSample();
            return;
        }

        state.missingSamples = 0;
        const windowMedian = pushLatencySample(rawMs);
        state.emaMs = state.emaMs === null
            ? windowMedian
            : Math.round(LATENCY_EMA_ALPHA * windowMedian + (1 - LATENCY_EMA_ALPHA) * state.emaMs);
        setVoiceLatencyMs(state.emaMs);
    } catch {
        publishMissingSample();
    }
}

/** Start periodic RTT sampling for the current published local audio track. */
export function startLatencyPolling(getLocalTrack: () => LocalAudioTrack | null) {
    if (state.timer) return;
    state.emaMs = null;
    state.window = [];
    state.missingSamples = 0;
    setVoiceLatencyMs(null);
    const timer = typeof window !== "undefined" ? window.setInterval : setInterval;
    state.timer = timer(() => {
        void sampleLatency(getLocalTrack);
    }, LATENCY_POLL_INTERVAL_MS);
    devLog("[voice] latency polling started");
    void sampleLatency(getLocalTrack);
}

/** Stop RTT sampling and clear the last published latency value. */
export function stopLatencyPolling() {
    if (state.timer) {
        clearInterval(state.timer);
        state.timer = null;
    }
    state.emaMs = null;
    state.missingSamples = 0;
    setVoiceLatencyMs(null);
}
