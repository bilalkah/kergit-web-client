import { BaseKeyProvider, createKeyMaterialFromBuffer } from "livekit-client";
import type { E2EEOptions } from "livekit-client";
import { devError, devLog, devWarn } from "@/src/utils/safeLogger";

/**
 * End-to-end encryption setup for LiveKit voice rooms.
 *
 * Used by: livekit.ts during room construction and teardown.
 * Manages a reusable worker plus the current key provider instance.
 *
 * Why a custom provider instead of ExternalE2EEKeyProvider:
 * ExternalE2EEKeyProvider only manages a single shared key slot (its setKey() always
 * writes index 0), so a rotation overwrites the live key and drops in-flight frames —
 * a "felt" blip. For seamless member-change rotation we install each new key at its own
 * keyring index. The worker keeps the last `keyringSize` keys and decrypts each frame
 * with the key at the index stamped on it, so the old key keeps decrypting in-flight
 * frames while new frames use the new key. Security comes from each rotation being a
 * fresh random key from the server (not a ratchet/derivation), so a departed member's
 * old key cannot produce any other index's key — hence ratchetWindowSize: 0.
 */
const KEYRING_SIZE = 16; // must match server E2EEKeyManager::kKeyringSize

class IndexedSharedKeyProvider extends BaseKeyProvider {
    constructor() {
        super({
            sharedKey: true,
            ratchetWindowSize: 0,
            failureTolerance: -1,
            keyringSize: KEYRING_SIZE,
        });
    }

    /** Install a key at a specific keyring index and make it the current encrypt key. */
    async setKeyAtIndex(keyBuffer: ArrayBuffer, keyIndex: number): Promise<void> {
        const material = await createKeyMaterialFromBuffer(keyBuffer);
        // Protected on BaseKeyProvider, callable from this subclass. Stores the key at
        // `keyIndex`, marks it current for encryption, and keeps prior indices in the ring.
        this.onSetEncryptionKey(material, undefined, keyIndex);
    }
}

let e2eeWorker: Worker | null = null;
let e2eeKeyProvider: IndexedSharedKeyProvider | null = null;
// Serializes applyE2EEKey() so rapid rotations apply in the order received.
let keyApplyChain: Promise<void> = Promise.resolve();

/** The API issues the E2EE key as base64; decode it before handing it to LiveKit. */
function decodeKey(e2eeKey: string): ArrayBuffer {
    return Uint8Array.from(atob(e2eeKey), (character) => character.charCodeAt(0)).buffer;
}

/** Build LiveKit E2EE options from a base64-encoded room key at the given key index. */
export async function setupE2EE(e2eeKey: string, keyIndex = 0): Promise<E2EEOptions> {
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

        e2eeKeyProvider = new IndexedSharedKeyProvider();
        await e2eeKeyProvider.setKeyAtIndex(decodeKey(e2eeKey), keyIndex % KEYRING_SIZE);

        devLog("[voice] E2EE enabled", { keyIndex });
        return {
            keyProvider: e2eeKeyProvider,
            worker: e2eeWorker,
        };
    } catch (e2eeError) {
        devError("[voice] E2EE setup failed", e2eeError);
        throw e2eeError;
    }
}

/**
 * Install a server-rotated room key at its keyring index on the live provider. LiveKit
 * keeps recent keys per index, so frames already in flight keep decrypting and the switch
 * is seamless. No-op if E2EE isn't currently set up.
 */
export function applyE2EEKey(e2eeKey: string, keyIndex = 0): Promise<void> {
    // Serialize applies: setKeyAtIndex awaits an async key import, so two rapid updates
    // could otherwise finish out of order and leave a stale index as the current encrypt
    // key. Chaining preserves the received order (which is the rotation order, since the
    // socket delivers per-connection in order). applyE2EEKeyNow never rejects, so a
    // failure can't break the chain.
    keyApplyChain = keyApplyChain.then(() => applyE2EEKeyNow(e2eeKey, keyIndex));
    return keyApplyChain;
}

async function applyE2EEKeyNow(e2eeKey: string, keyIndex: number): Promise<void> {
    if (!e2eeKeyProvider) {
        devWarn("[voice] applyE2EEKey skipped — no active key provider");
        return;
    }
    if (!e2eeKey) return;
    try {
        await e2eeKeyProvider.setKeyAtIndex(decodeKey(e2eeKey), keyIndex % KEYRING_SIZE);
        devLog("[voice] E2EE key applied", { keyIndex });
    } catch (applyError) {
        devError("[voice] applyE2EEKey failed", applyError);
    }
}

/** Tear down the current E2EE key provider and worker instance. */
export function resetE2EEKeyProvider() {
    e2eeKeyProvider = null;
    keyApplyChain = Promise.resolve();
    if (e2eeWorker) {
        try {
            e2eeWorker.terminate();
        } catch {
            // ignore worker termination failures
        }
        e2eeWorker = null;
    }
}
