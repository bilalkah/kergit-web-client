// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { assertPublicHostname, isPrivateIpv4, isPrivateIpv6, type HostLookup } from './linkPreview'

describe('link preview hostname guard', () => {
  it('blocks localhost-style hostnames', async () => {
    await expect(assertPublicHostname('localhost')).rejects.toThrow('Localhost')
    await expect(assertPublicHostname('api.local')).rejects.toThrow('Localhost')
  })

  it('detects private IPv4 ranges', () => {
    expect(isPrivateIpv4('10.0.0.1')).toBe(true)
    expect(isPrivateIpv4('127.0.0.1')).toBe(true)
    expect(isPrivateIpv4('169.254.1.1')).toBe(true)
    expect(isPrivateIpv4('172.20.10.2')).toBe(true)
    expect(isPrivateIpv4('192.168.1.99')).toBe(true)
    expect(isPrivateIpv4('100.64.0.1')).toBe(true)
    expect(isPrivateIpv4('198.51.100.10')).toBe(true)
    expect(isPrivateIpv4('224.0.0.1')).toBe(true)
    expect(isPrivateIpv4('8.8.8.8')).toBe(false)
  })

  it('detects private IPv6 ranges', () => {
    expect(isPrivateIpv6('::')).toBe(true)
    expect(isPrivateIpv6('::1')).toBe(true)
    expect(isPrivateIpv6('::ffff:127.0.0.1')).toBe(true)
    expect(isPrivateIpv6('::ffff:c0a8:101')).toBe(true)
    expect(isPrivateIpv6('fc00::1')).toBe(true)
    expect(isPrivateIpv6('fd12::abcd')).toBe(true)
    expect(isPrivateIpv6('fe80::1234')).toBe(true)
    expect(isPrivateIpv6('fe90::1234')).toBe(true)
    expect(isPrivateIpv6('2606:4700:4700::1111')).toBe(false)
  })

  it('blocks bracketed loopback IPv6 literals', async () => {
    await expect(assertPublicHostname('[::1]')).rejects.toThrow('Private IPv6')
  })

  it('blocks hostnames resolving to private addresses', async () => {
    const lookup: HostLookup = async () => [{ address: '192.168.10.20', family: 4 }]
    await expect(assertPublicHostname('example.test', lookup)).rejects.toThrow('Resolved private address')
  })

  it('allows hostnames resolving only to public addresses', async () => {
    const lookup: HostLookup = async () => [
      { address: '8.8.8.8', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ]

    await expect(assertPublicHostname('example.test', lookup)).resolves.toBeUndefined()
  })
})
