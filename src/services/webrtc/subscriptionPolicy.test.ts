import { afterEach, describe, expect, it, vi } from 'vitest'

// isLocallyDeafened()/isLocallyMuted() read from the Pinia app store, which is
// not active in unit tests. Stub the store helpers so the audio branch of the
// policy is deterministic (not deafened) without booting Nuxt/Pinia.
vi.mock('@/src/services/webrtc/storeHelpers', () => ({
  isLocallyDeafened: () => false,
  isLocallyMuted: () => false,
  getVoiceProcessingSettings: () => ({}),
  setVoiceError: () => {},
}))

import { Track } from 'livekit-client'
import {
  shouldSubscribeToRemotePublication,
  allowRemoteCamera,
  disallowRemoteCamera,
  allowScreenShareAudio,
  disallowScreenShareAudio,
} from './livekit'

type Pub = {
  kind: Track.Kind
  source: Track.Source
  trackSid: string
}

function pub(kind: Track.Kind, source: Track.Source, trackSid: string): Pub {
  return { kind, source, trackSid }
}

function remote(identity: string, screenVideoSid?: string) {
  return {
    identity,
    isLocal: false,
    // Used by the ScreenShareAudio branch to resolve the paired video track sid.
    getTrackPublication: (source: Track.Source) =>
      source === Track.Source.ScreenShare && screenVideoSid
        ? { trackSid: screenVideoSid }
        : undefined,
  }
}

const decide = (p: Pub, participant: unknown) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shouldSubscribeToRemotePublication(p as any, participant as any)

describe('remote subscription policy (opt-in for camera + screen share)', () => {
  afterEach(() => {
    // Allowlists are module-level; clear the identities used in these tests.
    disallowRemoteCamera('alice')
    disallowRemoteCamera('bob')
    disallowScreenShareAudio('alice')
    disallowScreenShareAudio('bob')
  })

  it('does not subscribe to a remote camera unless that camera is allowed', () => {
    const cam = pub(Track.Kind.Video, Track.Source.Camera, 'cam-1')
    const alice = remote('alice')

    expect(decide(cam, alice)).toBe(false)

    allowRemoteCamera('alice', ['cam-1'])
    expect(decide(cam, alice)).toBe(true)

    disallowRemoteCamera('alice')
    expect(decide(cam, alice)).toBe(false)
  })

  it('does not subscribe to a remote screen share unless screen media is allowed', () => {
    const screen = pub(Track.Kind.Video, Track.Source.ScreenShare, 'screen-1')
    const alice = remote('alice', 'screen-1')

    expect(decide(screen, alice)).toBe(false)

    allowScreenShareAudio('alice', ['screen-1'])
    expect(decide(screen, alice)).toBe(true)

    disallowScreenShareAudio('alice')
    expect(decide(screen, alice)).toBe(false)
  })

  it('subscribes to screen-share audio together with the opted-in screen share', () => {
    const screenAudio = pub(Track.Kind.Audio, Track.Source.ScreenShareAudio, 'screen-audio-1')
    const alice = remote('alice', 'screen-1')

    expect(decide(screenAudio, alice)).toBe(false)

    // Opting into the screen share (by its video sid) also unlocks its audio.
    allowScreenShareAudio('alice', ['screen-1'])
    expect(decide(screenAudio, alice)).toBe(true)
  })

  it('subscribes to remote microphone audio normally without opt-in', () => {
    const mic = pub(Track.Kind.Audio, Track.Source.Microphone, 'mic-1')
    expect(decide(mic, remote('alice'))).toBe(true)
  })

  it('allowing one participant camera does not allow another participant camera', () => {
    const aliceCam = pub(Track.Kind.Video, Track.Source.Camera, 'cam-alice')
    const bobCam = pub(Track.Kind.Video, Track.Source.Camera, 'cam-bob')

    allowRemoteCamera('alice', ['cam-alice'])

    expect(decide(aliceCam, remote('alice'))).toBe(true)
    expect(decide(bobCam, remote('bob'))).toBe(false)
  })

  it('allowing one participant screen share does not allow another participant screen share', () => {
    const aliceScreen = pub(Track.Kind.Video, Track.Source.ScreenShare, 'screen-alice')
    const bobScreen = pub(Track.Kind.Video, Track.Source.ScreenShare, 'screen-bob')

    allowScreenShareAudio('alice', ['screen-alice'])

    expect(decide(aliceScreen, remote('alice', 'screen-alice'))).toBe(true)
    expect(decide(bobScreen, remote('bob', 'screen-bob'))).toBe(false)
  })

  it('never subscribes via the remote policy for a local participant', () => {
    const cam = pub(Track.Kind.Video, Track.Source.Camera, 'cam-local')
    const localParticipant = { identity: 'me', isLocal: true }
    expect(decide(cam, localParticipant)).toBe(false)
  })
})
