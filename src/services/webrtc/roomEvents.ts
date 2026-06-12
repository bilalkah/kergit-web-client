import { RoomEvent } from "livekit-client";
import type {
    ConnectionState as LiveKitConnectionState,
    DisconnectReason,
    Participant,
    Room,
    Track,
} from "livekit-client";

/**
 * LiveKit Room event wiring for the currently active voice room.
 *
 * Used by: livekit.ts to attach a single tracked set of room listeners.
 * Keeps attach/detach logic centralized so teardown paths stay symmetric.
 */
type TrackSubscribedHandler = (
    track: Track,
    publication?: {
        setSubscribed?: (subscribed: boolean) => void;
        source?: Track.Source;
        trackSid?: string;
    },
    participant?: Participant,
) => void;

type TrackUnsubscribedHandler = (
    track: Track,
    publication?: { source?: Track.Source; trackSid?: string },
    participant?: Participant,
) => void;

type ActiveSpeakersChangedHandler = (participants: Participant[]) => void;
type ParticipantConnectedHandler = (participant?: Participant) => void;
type ParticipantDisconnectedHandler = (participant?: Participant) => void;
type ParticipantActiveHandler = (participant?: Participant) => void;
type TrackPublishedHandler = (
    publication?: { kind?: Track.Kind; source?: Track.Source; trackSid?: string },
    participant?: Participant,
) => void;
type TrackUnpublishedHandler = (
    publication?: { kind?: Track.Kind; source?: Track.Source; trackSid?: string },
    participant?: Participant,
) => void;
type TrackSubscriptionFailedHandler = (
    trackSid: string,
    participant?: Participant,
    reason?: unknown,
) => void;
type TrackSubscriptionStatusChangedHandler = (
    publication?: {
        kind?: Track.Kind;
        source?: Track.Source;
        trackSid?: string;
        isSubscribed?: boolean;
        setSubscribed?: (subscribed: boolean) => void;
    },
    status?: string,
    participant?: Participant,
) => void;
type ParticipantEncryptionStatusChangedHandler = (enabled: boolean, participant?: Participant) => void;
type EncryptionErrorHandler = (error: Error, participant?: Participant) => void;
type ReconnectingHandler = () => void;
type SignalReconnectingHandler = () => void;
type ConnectionStateChangedHandler = (state?: LiveKitConnectionState) => void;
type ReconnectedHandler = () => void;
type DisconnectedHandler = (reason?: DisconnectReason) => void | Promise<void>;
type AudioPlaybackStatusChangedHandler = () => void;

/** Handlers that livekit.ts provides for the active Room instance. */
export type RoomEventHandlers = {
    trackSubscribed: TrackSubscribedHandler;
    trackUnsubscribed: TrackUnsubscribedHandler;
    activeSpeakersChanged: ActiveSpeakersChangedHandler;
    participantConnected: ParticipantConnectedHandler;
    participantDisconnected: ParticipantDisconnectedHandler;
    participantActive: ParticipantActiveHandler;
    trackPublished: TrackPublishedHandler;
    trackUnpublished: TrackUnpublishedHandler;
    trackSubscriptionFailed: TrackSubscriptionFailedHandler;
    trackSubscriptionStatusChanged: TrackSubscriptionStatusChangedHandler;
    participantEncryptionStatusChanged: ParticipantEncryptionStatusChangedHandler;
    encryptionError: EncryptionErrorHandler;
    reconnecting: ReconnectingHandler;
    signalReconnecting: SignalReconnectingHandler;
    connectionStateChanged: ConnectionStateChangedHandler;
    reconnected: ReconnectedHandler;
    disconnected: DisconnectedHandler;
    audioPlaybackStatusChanged: AudioPlaybackStatusChangedHandler;
};

type AttachedRoomHandlers = {
    trackSubscribed: TrackSubscribedHandler;
    trackUnsubscribed: TrackUnsubscribedHandler;
    activeSpeakersChanged: ActiveSpeakersChangedHandler;
    participantConnected: ParticipantConnectedHandler;
    participantDisconnected: ParticipantDisconnectedHandler;
    participantActive: ParticipantActiveHandler;
    trackPublished: TrackPublishedHandler;
    trackUnpublished: TrackUnpublishedHandler;
    trackSubscriptionFailed: TrackSubscriptionFailedHandler;
    trackSubscriptionStatusChanged: TrackSubscriptionStatusChangedHandler;
    participantEncryptionStatusChanged: ParticipantEncryptionStatusChangedHandler;
    encryptionError: EncryptionErrorHandler;
    reconnecting: ReconnectingHandler;
    signalReconnecting: SignalReconnectingHandler;
    connectionStateChanged: ConnectionStateChangedHandler;
    reconnected: ReconnectedHandler;
    disconnected: DisconnectedHandler;
    audioPlaybackStatusChanged: AudioPlaybackStatusChangedHandler;
};

type RoomEventsState = {
    room: Room | null;
    handlers: AttachedRoomHandlers | null;
};

const state: RoomEventsState = {
    room: null,
    handlers: null,
};

/** Attach the current room event handlers, replacing any previous room wiring. */
export function attachRoomEvents(targetRoom: Room, handlers: RoomEventHandlers): void {
    detachRoomEvents(state.room);

    state.room = targetRoom;
    state.handlers = {
        trackSubscribed: handlers.trackSubscribed,
        trackUnsubscribed: handlers.trackUnsubscribed,
        activeSpeakersChanged: handlers.activeSpeakersChanged,
        participantConnected: handlers.participantConnected,
        participantDisconnected: handlers.participantDisconnected,
        participantActive: handlers.participantActive,
        trackPublished: handlers.trackPublished,
        trackUnpublished: handlers.trackUnpublished,
        trackSubscriptionFailed: handlers.trackSubscriptionFailed,
        trackSubscriptionStatusChanged: handlers.trackSubscriptionStatusChanged,
        participantEncryptionStatusChanged: handlers.participantEncryptionStatusChanged,
        encryptionError: handlers.encryptionError,
        reconnecting: handlers.reconnecting,
        signalReconnecting: handlers.signalReconnecting,
        connectionStateChanged: handlers.connectionStateChanged,
        reconnected: handlers.reconnected,
        disconnected: handlers.disconnected,
        audioPlaybackStatusChanged: handlers.audioPlaybackStatusChanged,
    };

    targetRoom.on(RoomEvent.TrackSubscribed, state.handlers.trackSubscribed);
    targetRoom.on(RoomEvent.TrackUnsubscribed, state.handlers.trackUnsubscribed);
    targetRoom.on(RoomEvent.ActiveSpeakersChanged, state.handlers.activeSpeakersChanged);
    targetRoom.on(RoomEvent.ParticipantConnected, state.handlers.participantConnected);
    targetRoom.on(RoomEvent.ParticipantDisconnected, state.handlers.participantDisconnected);
    targetRoom.on(RoomEvent.ParticipantActive, state.handlers.participantActive);
    targetRoom.on(RoomEvent.TrackPublished, state.handlers.trackPublished);
    targetRoom.on(RoomEvent.TrackUnpublished, state.handlers.trackUnpublished);
    targetRoom.on(RoomEvent.TrackSubscriptionFailed, state.handlers.trackSubscriptionFailed);
    targetRoom.on(
        RoomEvent.TrackSubscriptionStatusChanged,
        state.handlers.trackSubscriptionStatusChanged,
    );
    targetRoom.on(
        RoomEvent.ParticipantEncryptionStatusChanged,
        state.handlers.participantEncryptionStatusChanged,
    );
    targetRoom.on(RoomEvent.EncryptionError, state.handlers.encryptionError);
    targetRoom.on(RoomEvent.Reconnecting, state.handlers.reconnecting);
    targetRoom.on(RoomEvent.SignalReconnecting, state.handlers.signalReconnecting);
    targetRoom.on(RoomEvent.ConnectionStateChanged, state.handlers.connectionStateChanged);
    targetRoom.on(RoomEvent.Reconnected, state.handlers.reconnected);
    targetRoom.on(RoomEvent.Disconnected, state.handlers.disconnected);
    targetRoom.on(RoomEvent.AudioPlaybackStatusChanged, state.handlers.audioPlaybackStatusChanged);
}

/** Remove the tracked room event handlers from the active or provided room. */
export function detachRoomEvents(targetRoom: Room | null): void {
    const roomToDetach = targetRoom ?? state.room;
    const handlers = state.handlers;

    if (roomToDetach && handlers) {
        const roomWithOff = roomToDetach as Room & {
            off?: (event: RoomEvent, listener: (...args: any[]) => unknown) => void;
        };

        if (roomWithOff.off) {
            roomWithOff.off(RoomEvent.TrackSubscribed, handlers.trackSubscribed);
            roomWithOff.off(RoomEvent.TrackUnsubscribed, handlers.trackUnsubscribed);
            roomWithOff.off(RoomEvent.ActiveSpeakersChanged, handlers.activeSpeakersChanged);
            roomWithOff.off(RoomEvent.ParticipantConnected, handlers.participantConnected);
            roomWithOff.off(RoomEvent.ParticipantDisconnected, handlers.participantDisconnected);
            roomWithOff.off(RoomEvent.ParticipantActive, handlers.participantActive);
            roomWithOff.off(RoomEvent.TrackPublished, handlers.trackPublished);
            roomWithOff.off(RoomEvent.TrackUnpublished, handlers.trackUnpublished);
            roomWithOff.off(RoomEvent.TrackSubscriptionFailed, handlers.trackSubscriptionFailed);
            roomWithOff.off(
                RoomEvent.TrackSubscriptionStatusChanged,
                handlers.trackSubscriptionStatusChanged,
            );
            roomWithOff.off(
                RoomEvent.ParticipantEncryptionStatusChanged,
                handlers.participantEncryptionStatusChanged,
            );
            roomWithOff.off(RoomEvent.EncryptionError, handlers.encryptionError);
            roomWithOff.off(RoomEvent.Reconnecting, handlers.reconnecting);
            roomWithOff.off(RoomEvent.SignalReconnecting, handlers.signalReconnecting);
            roomWithOff.off(RoomEvent.ConnectionStateChanged, handlers.connectionStateChanged);
            roomWithOff.off(RoomEvent.Reconnected, handlers.reconnected);
            roomWithOff.off(RoomEvent.Disconnected, handlers.disconnected);
            roomWithOff.off(RoomEvent.AudioPlaybackStatusChanged, handlers.audioPlaybackStatusChanged);
        }
    }

    state.handlers = null;
    state.room = null;
}
