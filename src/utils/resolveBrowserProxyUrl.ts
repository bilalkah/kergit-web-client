export function resolveBrowserProxyUrl(pathname: string, label: string): string {
  if (typeof window === 'undefined') {
    throw new Error(`[${label}] resolveBrowserProxyUrl must run in the browser`)
  }

  const url = new URL(window.location.origin)
  url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = pathname
  url.search = ''
  url.hash = ''
  return url.toString()
}
