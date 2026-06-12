export type QueryParamValue = string | null | undefined | Array<string | null>

export function getSingleQueryParam(value: QueryParamValue): string | null {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : null
  }
  return typeof value === 'string' ? value : null
}

export function clearAuthCallbackUrl() {
  if (typeof window === 'undefined') return
  window.history.replaceState(null, '', window.location.pathname)
}
