export type HubRoleKey = 'owner' | 'admin' | 'member'

export interface HubRoleMeta {
  key: HubRoleKey
  label: string
  badge: string
}

const ROLE_META: Record<HubRoleKey, HubRoleMeta> = {
  owner: { key: 'owner', label: 'Sahip', badge: 'SAHIP' },
  admin: { key: 'admin', label: 'Yonetici', badge: 'YONETICI' },
  member: { key: 'member', label: 'Uye', badge: 'UYE' },
}

export function normalizeHubRole(value: string | null | undefined): HubRoleKey {
  if (value === 'owner' || value === 'admin' || value === 'member') return value
  return 'member'
}

export function getHubRoleMeta(value: string | null | undefined): HubRoleMeta {
  return ROLE_META[normalizeHubRole(value)]
}

export function canInvite(actorRole: string | null | undefined): boolean {
  const role = normalizeHubRole(actorRole)
  return role === 'owner' || role === 'admin'
}

export function canKickHubMember(
  actorRole: string | null | undefined,
  targetRole: string | null | undefined,
  actorId: string | null | undefined,
  targetId: string | null | undefined
): boolean {
  const actor = normalizeHubRole(actorRole)
  const target = normalizeHubRole(targetRole)
  if (!actorId || !targetId || actorId === targetId) return false
  if (target === 'owner') return false

  if (actor === 'owner') {
    return target === 'admin' || target === 'member'
  }
  if (actor === 'admin') {
    return target === 'member'
  }
  return false
}

export function canKickVoiceParticipant(
  actorRole: string | null | undefined,
  targetRole: string | null | undefined,
  actorId: string | null | undefined,
  targetId: string | null | undefined
): boolean {
  return canKickHubMember(actorRole, targetRole, actorId, targetId)
}

export function canChangeMemberRole(
  actorRole: string | null | undefined,
  targetRole: string | null | undefined,
  desiredRole: HubRoleKey,
  actorId: string | null | undefined,
  targetId: string | null | undefined
): boolean {
  const actor = normalizeHubRole(actorRole)
  const target = normalizeHubRole(targetRole)
  if (actor !== 'owner') return false
  if (!actorId || !targetId || actorId === targetId) return false
  if (target === 'owner') return false
  if (desiredRole === 'owner') return false
  if (target === desiredRole) return false
  return target === 'admin' || target === 'member'
}

export function toProtoHubRole(role: HubRoleKey): number {
  if (role === 'owner') return 2
  if (role === 'admin') return 3
  return 1
}
