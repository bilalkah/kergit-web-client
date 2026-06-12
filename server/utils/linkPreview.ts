import dns from 'node:dns/promises'
import net from 'node:net'

export type HostLookupRecord = {
  address: string
  family: number
}

export type HostLookup = (hostname: string) => Promise<HostLookupRecord[]>

const defaultLookup: HostLookup = async (hostname) => dns.lookup(hostname, { all: true, verbatim: true })

function parseIpv4(ip: string): [number, number, number, number] | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null

  const bytes = parts.map((part) => /^\d{1,3}$/.test(part) ? Number(part) : Number.NaN)
  if (bytes.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null

  return bytes as [number, number, number, number]
}

export function isPrivateIpv4(ip: string): boolean {
  const bytes = parseIpv4(ip)
  if (!bytes) return true
  const [a, b, c] = bytes

  if (a === 0) return true
  if (a === 10) return true
  if (a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 192 && b === 0 && c === 0) return true
  if (a === 192 && b === 0 && c === 2) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a === 198 && b === 51 && c === 100) return true
  if (a === 203 && b === 0 && c === 113) return true
  if (a >= 224) return true
  return false
}

export function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[|\]$/g, '')
  if (normalized === '::' || normalized === '::1') return true

  const dottedIpv4 = normalized.match(/^(?:::ffff:|::)(\d+\.\d+\.\d+\.\d+)$/)?.[1]
  if (dottedIpv4) return isPrivateIpv4(dottedIpv4)

  const mappedHex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (mappedHex) {
    const high = Number.parseInt(mappedHex[1] ?? '', 16)
    const low = Number.parseInt(mappedHex[2] ?? '', 16)
    const mappedIpv4 = [
      high >> 8,
      high & 0xff,
      low >> 8,
      low & 0xff,
    ].join('.')
    return isPrivateIpv4(mappedIpv4)
  }

  const firstGroup = Number.parseInt(normalized.split(':')[0] ?? '', 16)
  if (Number.isNaN(firstGroup)) return true
  if ((firstGroup & 0xfe00) === 0xfc00) return true
  if ((firstGroup & 0xffc0) === 0xfe80) return true
  if ((firstGroup & 0xff00) === 0xff00) return true
  if (normalized.startsWith('2001:db8:')) return true
  return false
}

export async function assertPublicHostname(
  hostname: string,
  lookup: HostLookup = defaultLookup,
): Promise<void> {
  const normalizedHostname = hostname.trim().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  const lower = normalizedHostname.toLowerCase()
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.local')) {
    throw new Error('Localhost addresses are blocked')
  }

  const ipVersion = net.isIP(normalizedHostname)
  if (ipVersion === 4 && isPrivateIpv4(normalizedHostname)) {
    throw new Error('Private IPv4 addresses are blocked')
  }

  if (ipVersion === 6 && isPrivateIpv6(normalizedHostname)) {
    throw new Error('Private IPv6 addresses are blocked')
  }

  if (ipVersion !== 0) return

  const records = await lookup(normalizedHostname)
  if (records.length === 0) {
    throw new Error('Hostname did not resolve')
  }

  for (const record of records) {
    const ip = record.address
    if ((record.family === 4 && isPrivateIpv4(ip)) || (record.family === 6 && isPrivateIpv6(ip))) {
      throw new Error('Resolved private address is blocked')
    }
  }
}
