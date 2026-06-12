import type { LocalAudioTrack } from "livekit-client";
import { devLog, devWarn } from "@/src/utils/safeLogger";

/**
 * Krisp noise filter processor lifecycle management.
 *
 * Lazily imports @livekit/krisp-noise-filter to avoid bundling the SDK
 * when Krisp is not in use. Manages a single processor instance per session.
 *
 * Used by: livekit.ts and controls.ts.
 */

type KrispProcessorInstance = {
    setEnabled: (enable: boolean) => Promise<boolean | undefined>;
    isEnabled: () => boolean;
    destroy: () => Promise<void>;
};

type KrispRuntimeModule = {
    KrispNoiseFilter: () => unknown;
    isKrispNoiseFilterSupported: () => boolean;
};

let processor: KrispProcessorInstance | null = null;
let attached = false;
let krispRuntimeModulePromise: Promise<KrispRuntimeModule | null> | null = null;

async function loadKrispRuntimeModule(): Promise<KrispRuntimeModule | null> {
    if (!import.meta.client) return null;
    if (!krispRuntimeModulePromise) {
        krispRuntimeModulePromise = import("@livekit/krisp-noise-filter")
            .then((module) => ({
                KrispNoiseFilter: module.KrispNoiseFilter,
                isKrispNoiseFilterSupported: module.isKrispNoiseFilterSupported,
            }))
            .catch((err) => {
                devWarn("[krisp] failed to load runtime module", err);
                krispRuntimeModulePromise = null;
                return null;
            });
    }
    return krispRuntimeModulePromise;
}

/** Check if the current browser supports the Krisp noise filter. */
export async function isKrispSupported(): Promise<boolean> {
    try {
        const runtimeModule = await loadKrispRuntimeModule();
        if (!runtimeModule) return false;
        return runtimeModule.isKrispNoiseFilterSupported();
    } catch {
        return false;
    }
}

/** Apply the Krisp processor to a local audio track. Creates a new instance if needed. */
export async function applyKrispToTrack(track: LocalAudioTrack): Promise<boolean> {
    try {
        const runtimeModule = await loadKrispRuntimeModule();
        if (!runtimeModule) return false;

        if (!runtimeModule.isKrispNoiseFilterSupported()) {
            devWarn("[krisp] not supported on this browser");
            return false;
        }
        // Stop existing processor if track changed
        if (processor && attached) {
            try {
                await track.stopProcessor();
            } catch {
                // ignore
            }
            processor = null;
            attached = false;
        }
        processor = runtimeModule.KrispNoiseFilter() as unknown as KrispProcessorInstance;
        await track.setProcessor(processor as any);
        await processor.setEnabled(true);
        attached = true;
        devLog("[krisp] noise filter applied and enabled");
        return true;
    } catch (err) {
        devWarn("[krisp] failed to apply noise filter", err);
        processor = null;
        attached = false;
        return false;
    }
}

/** Remove the Krisp processor from the current track. */
export async function removeKrispFromTrack(track: LocalAudioTrack | null): Promise<void> {
    if (!attached || !track) {
        processor = null;
        attached = false;
        return;
    }
    try {
        await track.stopProcessor();
    } catch {
        // ignore
    }
    processor = null;
    attached = false;
    devLog("[krisp] noise filter removed");
}

/** Return whether Krisp is currently active on a track. */
export function isKrispActive(): boolean {
    return attached && processor !== null;
}

/** Destroy the Krisp processor entirely during teardown. */
export async function destroyKrisp(): Promise<void> {
    if (processor) {
        try {
            await processor.destroy();
        } catch {
            // ignore
        }
    }
    processor = null;
    attached = false;
}
