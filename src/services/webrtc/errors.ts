import {
    ConnectionError,
    ConnectionErrorReason,
    DisconnectReason,
} from "livekit-client";

/**
 * Error classification helpers for voice connection and disconnection handling.
 *
 * Used by: livekit.ts retry logic and user-facing error presentation.
 * Depends on: livekit-client error enums.
 */
/** Convert a voice connection error into a stable debug string. */
export function describeVoiceConnectError(err: unknown): string {
    if (err instanceof ConnectionError) {
        const reasonName = ConnectionErrorReason[err.reason] ?? String(err.reason);
        const message = typeof err.message === "string" && err.message.length > 0 ? ` (${err.message})` : "";
        return `ConnectionError:${reasonName}${message}`;
    }

    if (err instanceof Error) {
        return `${err.name}: ${err.message}`;
    }

    if (typeof err === "string") {
        return err;
    }

    return "Unknown voice connection error";
}

/** Convert a connection error into a user-facing message. */
export function userFacingVoiceConnectError(err: unknown): string {
    if (err instanceof ConnectionError) {
        if (err.reason === ConnectionErrorReason.NotAllowed) {
            return "Microphone permission denied";
        }
        if (err.reason === ConnectionErrorReason.ServiceNotFound) {
            return "Voice service unavailable";
        }
    }

    if (err instanceof Error) {
        if (err.name === "NotAllowedError") return "Microphone permission denied";
        if (err.name === "NotFoundError") return "No microphone device found";
        if (err.name === "NotReadableError") return "Microphone is in use by another app";
        if (err.name === "SecurityError") return "Voice requires a secure origin (HTTPS)";
    }

    return "Unable to connect to voice server";
}

/** Convert an encryption/runtime error into a stable debug string. */
export function describeVoiceEncryptionError(err: unknown): string {
    if (err instanceof Error) {
        return `${err.name}: ${err.message}`;
    }

    if (typeof err === "string") {
        return err;
    }

    return "Unknown voice encryption error";
}

/** Convert an encryption/runtime error into a short user-facing message. */
export function userFacingVoiceEncryptionError(_err: unknown): string {
    return "Voice encryption error";
}

/** Return whether a connection failure was caused by an intentional cancellation. */
export function isCancelledError(err: unknown): boolean {
    return err instanceof ConnectionError && (
        err.reason === ConnectionErrorReason.Cancelled ||
        err.reason === ConnectionErrorReason.LeaveRequest
    );
}

/** Return whether a connection failure should stop retry attempts immediately. */
export function isUnrecoverableError(err: unknown): boolean {
    if (err instanceof ConnectionError) {
        if (err.reason === ConnectionErrorReason.NotAllowed) return true;
        if (err.reason === ConnectionErrorReason.ServiceNotFound) return true;
    }

    if (err instanceof Error) {
        const name = err.name;
        if (name === "NotAllowedError") return true;
        if (name === "NotFoundError") return true;
        if (name === "NotReadableError") return true;
        if (name === "SecurityError") return true;
        if (name === "DeviceUnsupportedError") return true;
        if (name === "UnsupportedServer") return true;
    }

    return false;
}

export function describeVoiceDisconnectReason(reason?: DisconnectReason): string {
    if (reason === undefined || reason === null) return "";
    return DisconnectReason[reason] ?? "";
}

/** Return whether a disconnect reason should prevent automatic reconnects. */
export function isUnrecoverableDisconnect(reason?: DisconnectReason): boolean {
    const name = describeVoiceDisconnectReason(reason);
    if (!name) return false;
    return [
        "DUPLICATE_IDENTITY",
        "PARTICIPANT_REMOVED",
        "ROOM_DELETED",
        "ROOM_CLOSED",
        "USER_REJECTED",
    ].includes(name);
}
