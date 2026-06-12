import { describe, expect, it } from 'vitest'
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
})
