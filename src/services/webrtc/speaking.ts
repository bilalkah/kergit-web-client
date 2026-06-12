import type { Participant } from "livekit-client";
import {
    clearSpeakingUsers,
    setSpeakingUsers,
} from "@/src/services/webrtc/storeHelpers";

/**
 * Speaking state derived exclusively from LiveKit's active speaker updates.
 *
 * Used by: livekit.ts room event handlers.
 * Used from: the app store speaking indicator and participant UI.
 */
type SpeakingState = {
    signature: string;
};

const state: SpeakingState = {
    signature: "",
};

function normalizeSpeakingUserIds(participants: Iterable<Participant>): string[] {
    const normalized = new Set<string>();
    for (const participant of participants) {
        const identity = participant.identity?.trim();
        if (!identity) continue;
        normalized.add(identity);
    }
    return Array.from(normalized).sort();
}

/** Sync the speaking indicator state from LiveKit's active speaker list. */
export function syncSpeakingUsersFromParticipants(participants: Iterable<Participant>) {
    const userIds = normalizeSpeakingUserIds(participants);
    const signature = userIds.join(",");
    if (signature === state.signature) return;
    state.signature = signature;

    if (userIds.length === 0) {
        clearSpeakingUsers();
        return;
    }
    setSpeakingUsers(userIds);
}

/** Reset speaking indicators during a full voice teardown. */
export function resetSpeakingUsers() {
    state.signature = "";
    clearSpeakingUsers();
}
