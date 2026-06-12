export function canUseLocalStorage(): boolean {
  return import.meta.client && typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}
