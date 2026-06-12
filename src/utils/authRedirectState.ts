export type AuthRedirectFlow = 'signup-verification' | 'password-recovery'

export const AUTH_REDIRECT_FLOW_PARAM = 'auth_flow'
export const AUTH_REDIRECT_STATE_PARAM = 'auth_state'

const STORAGE_KEY = 'kergit.pendingAuthRedirectStates'
const AUTH_REDIRECT_STATE_TTL_MS = 24 * 60 * 60 * 1000

interface PendingAuthRedirectState {
    state: string
    createdAt: number
}

type PendingAuthRedirectStateMap = Partial<Record<AuthRedirectFlow, PendingAuthRedirectState>>

type AuthRedirectStateValidationReason =
    | 'storage_unavailable'
    | 'missing_state'
    | 'missing_pending_state'
    | 'mismatched_state'

export type AuthRedirectStateValidationResult =
    | { ok: true }
    | { ok: false, reason: AuthRedirectStateValidationReason }

function getStorage(): Storage | null {
    if (typeof window === 'undefined') return null

    try {
        return window.localStorage
    } catch {
        return null
    }
}

function generateState(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }

    if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
        throw new Error('Secure auth redirect state generation is unavailable in this browser.')
    }

    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)

    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function cleanupExpiredStates(states: PendingAuthRedirectStateMap, now = Date.now()): PendingAuthRedirectStateMap {
    const cleaned: PendingAuthRedirectStateMap = {}

    for (const [flow, pendingState] of Object.entries(states) as Array<[AuthRedirectFlow, PendingAuthRedirectState | null | undefined]>) {
        if (!pendingState || typeof pendingState.state !== 'string' || typeof pendingState.createdAt !== 'number') {
            continue
        }

        if (now - pendingState.createdAt < AUTH_REDIRECT_STATE_TTL_MS) {
            cleaned[flow] = pendingState
        }
    }

    return cleaned
}

function readPendingAuthRedirectStates(storage: Storage): PendingAuthRedirectStateMap {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return {}

    try {
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {}
        }

        return cleanupExpiredStates(parsed)
    } catch {
        return {}
    }
}

function writePendingAuthRedirectStates(storage: Storage, states: PendingAuthRedirectStateMap) {
    if (Object.keys(states).length === 0) {
        storage.removeItem(STORAGE_KEY)
        return
    }

    storage.setItem(STORAGE_KEY, JSON.stringify(states))
}

export function issueAuthRedirectUrl(path: string, flow: AuthRedirectFlow): string {
    const storage = getStorage()
    if (!storage || typeof window === 'undefined') {
        throw new Error('Secure auth redirect state storage is unavailable in this browser.')
    }

    const states = readPendingAuthRedirectStates(storage)
    const state = generateState()

    states[flow] = {
        state,
        createdAt: Date.now()
    }

    writePendingAuthRedirectStates(storage, states)

    const url = new URL(path, window.location.origin)
    url.searchParams.set(AUTH_REDIRECT_FLOW_PARAM, flow)
    url.searchParams.set(AUTH_REDIRECT_STATE_PARAM, state)

    return url.toString()
}

export function clearPendingAuthRedirectState(flow: AuthRedirectFlow) {
    const storage = getStorage()
    if (!storage) return

    const states = readPendingAuthRedirectStates(storage)
    if (!states[flow]) return

    delete states[flow]
    writePendingAuthRedirectStates(storage, states)
}

export function consumePendingAuthRedirectState(
    flow: AuthRedirectFlow,
    state: string | null | undefined
): AuthRedirectStateValidationResult {
    const storage = getStorage()
    if (!storage) {
        return { ok: false, reason: 'storage_unavailable' }
    }

    if (!state) {
        return { ok: false, reason: 'missing_state' }
    }

    const states = readPendingAuthRedirectStates(storage)
    const pendingState = states[flow]

    if (!pendingState) {
        writePendingAuthRedirectStates(storage, states)
        return { ok: false, reason: 'missing_pending_state' }
    }

    if (pendingState.state !== state) {
        writePendingAuthRedirectStates(storage, states)
        return { ok: false, reason: 'mismatched_state' }
    }

    delete states[flow]
    writePendingAuthRedirectStates(storage, states)

    return { ok: true }
}
