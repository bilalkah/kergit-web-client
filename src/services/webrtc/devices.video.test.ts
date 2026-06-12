import { beforeEach, describe, expect, it, vi } from 'vitest'

// Force the localStorage-backed helpers to be active in the test environment
// (devices.ts gates them behind canUseLocalStorage()/import.meta.client).
vi.mock('@/src/utils/storage', () => ({
  canUseLocalStorage: () => true,
}))

import {
  DEFAULT_CAMERA_QUALITY,
  DEFAULT_SCREEN_SHARE_QUALITY,
  VIDEO_QUALITY_PRESETS,
  getCameraQualityPreset,
  getScreenShareQualityPreset,
  setCameraQualityPreset,
  setScreenShareQualityPreset,
} from './devices'

const CAMERA_QUALITY_KEY = 'video.camera.quality'
const SCREEN_SHARE_QUALITY_KEY = 'video.screenshare.quality'

describe('video quality presets', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('exposes only 720p60 and 1080p30 presets', () => {
    expect(Object.keys(VIDEO_QUALITY_PRESETS).sort()).toEqual(['1080p30', '720p60'])
    expect(VIDEO_QUALITY_PRESETS['720p60']).toEqual({ width: 1280, height: 720, frameRate: 60 })
    expect(VIDEO_QUALITY_PRESETS['1080p30']).toEqual({ width: 1920, height: 1080, frameRate: 30 })
  })

  it('defaults both camera and screen share to 720p60', () => {
    expect(DEFAULT_CAMERA_QUALITY).toBe('720p60')
    expect(DEFAULT_SCREEN_SHARE_QUALITY).toBe('720p60')
    expect(getCameraQualityPreset()).toBe('720p60')
    expect(getScreenShareQualityPreset()).toBe('720p60')
  })

  it('normalizes legacy stored camera values to 720p60', () => {
    for (const legacy of ['720p30', '1080p60', '1440p30', 'garbage']) {
      window.localStorage.setItem(CAMERA_QUALITY_KEY, legacy)
      expect(getCameraQualityPreset()).toBe('720p60')
    }
  })

  it('normalizes legacy stored screen share values to 720p60', () => {
    for (const legacy of ['720p30', '1080p60', '1440p30', 'garbage']) {
      window.localStorage.setItem(SCREEN_SHARE_QUALITY_KEY, legacy)
      expect(getScreenShareQualityPreset()).toBe('720p60')
    }
  })

  it('preserves valid stored presets', () => {
    setCameraQualityPreset('1080p30')
    expect(getCameraQualityPreset()).toBe('1080p30')

    setScreenShareQualityPreset('1080p30')
    expect(getScreenShareQualityPreset()).toBe('1080p30')
  })

  it('keeps camera and screen share quality independent of any video mode preference', () => {
    setCameraQualityPreset('1080p30')
    setScreenShareQualityPreset('720p60')

    // Writing a video-mode preference must not influence stored quality presets.
    window.localStorage.setItem('video.mode', 'quality')
    expect(getCameraQualityPreset()).toBe('1080p30')
    expect(getScreenShareQualityPreset()).toBe('720p60')

    window.localStorage.setItem('video.mode', 'performance')
    expect(getCameraQualityPreset()).toBe('1080p30')
    expect(getScreenShareQualityPreset()).toBe('720p60')
  })
})
