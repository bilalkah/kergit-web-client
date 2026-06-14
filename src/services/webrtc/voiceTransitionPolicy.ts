export type VoiceTransitionTargetLike = {
    hubId: string
    channelId: string
}

export type ActiveVoiceTransitionLike = {
    id: number
    kind: string
    phase: string
    to: VoiceTransitionTargetLike | null
}

const JOIN_LIKE_KINDS = new Set(['join', 'switch', 'takeover'])
const TERMINAL_PHASES = new Set(['completed', 'timed_out'])

export function isDuplicateInFlightVoiceJoin(
    active: ActiveVoiceTransitionLike | null | undefined,
    target: VoiceTransitionTargetLike
): boolean {
    if (!active || !active.to || TERMINAL_PHASES.has(active.phase)) return false
    return JOIN_LIKE_KINDS.has(active.kind) &&
        active.to.hubId === target.hubId &&
        active.to.channelId === target.channelId
}
