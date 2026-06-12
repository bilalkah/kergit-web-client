import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// Enable the localStorage-backed preference helpers in the test environment
// (app.ts gates them behind canUseLocalStorage()/import.meta.client).
vi.mock('@/src/utils/storage', () => ({
  canUseLocalStorage: () => true,
}))

import { useAppStore } from './app'
import { NoiseCancellationMethod } from '@/src/services/webrtc/inputHandler'

const NC_METHOD_KEY = 'voice_noise_cancellation_method'

describe('noise cancellation method (Krisp disabled)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('normalizes a legacy stored krisp preference back to WebRTC on init', () => {
    window.localStorage.setItem(NC_METHOD_KEY, 'krisp')

    const app = useAppStore()

    expect(app.voiceProcessingSettings.noiseCancellationMethod).toBe(NoiseCancellationMethod.WebRTC)
    // Legacy value must be overwritten in storage, not left as 'krisp'.
    expect(window.localStorage.getItem(NC_METHOD_KEY)).toBe(NoiseCancellationMethod.WebRTC)
  })

  it('refuses to activate Krisp when set explicitly and persists WebRTC instead', () => {
    const app = useAppStore()

    app.setNoiseCancellationMethod(NoiseCancellationMethod.Krisp)

    expect(app.voiceProcessingSettings.noiseCancellationMethod).toBe(NoiseCancellationMethod.WebRTC)
    expect(window.localStorage.getItem(NC_METHOD_KEY)).not.toBe('krisp')
  })

  it('defaults to WebRTC when nothing is stored', () => {
    const app = useAppStore()
    expect(app.voiceProcessingSettings.noiseCancellationMethod).toBe(NoiseCancellationMethod.WebRTC)
  })
})
