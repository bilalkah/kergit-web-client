import { afterEach, describe, expect, it, vi } from 'vitest'

const { applyKrispToTrack, removeKrispFromTrack } = vi.hoisted(() => ({
  applyKrispToTrack: vi.fn(async () => true),
  removeKrispFromTrack: vi.fn(async () => {}),
}))

// Mock the Krisp processor so we can assert the runtime never applies it while
// Krisp is disabled. removeKrispFromTrack stays available for cleanup.
vi.mock('@/src/services/webrtc/krispProcessor', () => ({
  applyKrispToTrack,
  removeKrispFromTrack,
  isKrispSupported: async () => false,
  isKrispActive: () => false,
  destroyKrisp: async () => {},
}))

import { createVoiceInputHandler, NoiseCancellationMethod, InputSensitivityMode } from './inputHandler'

function createFakeTrack() {
  return {
    getDeviceId: vi.fn(async () => 'default'),
    restartTrack: vi.fn(async (_constraints: Record<string, unknown>) => {}),
    mediaStreamTrack: { enabled: true, getSettings: () => ({ deviceId: 'default' }) },
    stopProcessor: vi.fn(async () => {}),
  }
}

describe('input handler with Krisp disabled', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('never applies Krisp and keeps WebRTC noise suppression on even when Krisp is requested', async () => {
    const track = createFakeTrack()
    const handler = createVoiceInputHandler({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getTrack: () => track as any,
      getPreferredMicrophoneDeviceId: () => '',
      warn: () => {},
    })

    await handler.applyVoiceProcessingSettings({
      noiseCancellationMethod: NoiseCancellationMethod.Krisp,
      inputSensitivityMode: InputSensitivityMode.Auto,
      inputSensitivityThreshold: 42,
    })

    expect(applyKrispToTrack).not.toHaveBeenCalled()

    // The track must have been restarted with WebRTC noise suppression active.
    const restartCalls = track.restartTrack.mock.calls
    expect(restartCalls.length).toBeGreaterThan(0)
    const lastCall = restartCalls.at(-1)
    const lastConstraints = lastCall?.[0]
    expect(lastConstraints).toMatchObject({
      noiseSuppression: true,
      voiceIsolation: true,
      echoCancellation: true,
      autoGainControl: true,
    })
  })
})
