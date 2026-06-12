import { ExternalE2EEKeyProvider } from "livekit-client";
import type { E2EEOptions } from "livekit-client";
import { devError, devLog } from "@/src/utils/safeLogger";

/**
 * End-to-end encryption setup for LiveKit voice rooms.
 *
 * Used by: livekit.ts during room construction and teardown.
 * Manages a reusable worker plus the current key provider instance.
 */
let e2eeWorker: Worker | null = null;
let e2eeKeyProvider: ExternalE2EEKeyProvider | null = null;

/** Build LiveKit E2EE options from a base64-encoded room key. */
export async function setupE2EE(e2eeKey: string): Promise<E2EEOptions> {
    try {
        if (!e2eeKey) {
            throw new Error("missing_e2ee_key");
        }
        if (!e2eeWorker) {
            e2eeWorker = new Worker(
                new URL("livekit-client/e2ee-worker", import.meta.url),
                { type: "module" },
            );
        }

        e2eeKeyProvider = new ExternalE2EEKeyProvider();

        // The API issues the E2EE key as base64, so decode it before handing it to LiveKit.
        const keyBytes = Uint8Array.from(atob(e2eeKey), (character) => character.charCodeAt(0));
        await e2eeKeyProvider.setKey(keyBytes.buffer);

        devLog("[voice] E2EE enabled");
        return {
            keyProvider: e2eeKeyProvider,
            worker: e2eeWorker,
        };
    } catch (e2eeError) {
        devError("[voice] E2EE setup failed", e2eeError);
        throw e2eeError;
    }
}

/** Tear down the current E2EE key provider and worker instance. */
export function resetE2EEKeyProvider() {
    e2eeKeyProvider = null;
    if (e2eeWorker) {
        try {
            e2eeWorker.terminate();
        } catch {
            // ignore worker termination failures
        }
        e2eeWorker = null;
    }
}
