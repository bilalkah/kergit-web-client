import { describe, expect, it } from 'vitest'
import { sercom } from '@/src/generated/proto/proto.js'
import { ENVELOPE_VERSION, protoService } from './proto'

describe('protoService envelope codec', () => {
  it('round-trips an AUTH_OK envelope', () => {
    const type = protoService.EnvelopeType.AUTH_OK as number
    const encoded = protoService.encodeEnvelope(type)

    expect(protoService.decodeEnvelope(encoded)).toMatchObject({
      version: ENVELOPE_VERSION,
      type,
    })
  })

  it('encodes a ValidateHubInvite command carrying the join code', () => {
    const payload = protoService.encodeValidateHubInvite('abc123XYZ0')
    expect(payload.length).toBeGreaterThan(0)
    // Round-trip through the envelope using the HUB_INVITE_VALIDATE type.
    const env = protoService.encodeEnvelope(
      protoService.EnvelopeType.HUB_INVITE_VALIDATE as number,
      payload,
    )
    expect(protoService.decodeEnvelope(env)).toMatchObject({
      version: ENVELOPE_VERSION,
      type: protoService.EnvelopeType.HUB_INVITE_VALIDATE as number,
    })
  })

  it('decodes a hub invite preview (valid-invite response)', () => {
    // Build a domain.Hub payload the way the server replies to a valid invite.
    const HubDomain = sercom.protocol.domain.Hub
    const buf = HubDomain.encode(
      HubDomain.create({ id: 'hub-1', name: 'My Hub', metadata: { avatar_seed: 'Felix' } }),
    ).finish()

    const preview = protoService.decodeHubInvitePreview(buf)
    expect(preview.id).toBe('hub-1')
    expect(preview.name).toBe('My Hub')
    expect(preview.metadata?.avatar_seed).toBe('Felix')
  })
})
