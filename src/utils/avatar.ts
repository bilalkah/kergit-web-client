const DEFAULT_USER_SEED = 'Caleb'
const DEFAULT_HUB_SEED = 'Felix'

const DICEBEAR_BASE = 'https://api.dicebear.com/9.x'

const normalizeSeed = (seed: string | null | undefined, fallback: string): string => {
    const trimmed = (seed ?? '').trim()
    return trimmed.length > 0 ? trimmed : fallback
}

const buildAvatarUrl = (style: string, seed: string): string =>
    `${DICEBEAR_BASE}/${style}/svg?seed=${encodeURIComponent(seed)}`

export const userAvatarUrl = (avatarSeed?: string | null): string => {
    const seed = normalizeSeed(avatarSeed, DEFAULT_USER_SEED)
    return buildAvatarUrl('avataaars', seed)
}

export const hubAvatarUrl = (avatarSeed?: string | null): string => {
    const seed = normalizeSeed(avatarSeed, DEFAULT_HUB_SEED)
    return buildAvatarUrl('bottts', seed)
}
