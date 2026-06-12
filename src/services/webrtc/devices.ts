import { Room } from 'livekit-client'
import { canUseLocalStorage } from '@/src/utils/storage'

/**
 * Audio device persistence and enumeration helpers for voice settings.
 *
 * Used by: livekit and controls.
 * Used from: the settings modal and voice connection bootstrap.
 */
/** Supported WebRTC device categories managed by the voice subsystem. */
export type VoiceDeviceKind = 'audioinput' | 'audiooutput'

/** Quality presets for camera and screen share. */
export type VideoQualityPreset = '720p30' | '720p60' | '1080p30' | '1080p60' | '1440p30'

export const VIDEO_QUALITY_PRESETS: Record<VideoQualityPreset, { width: number; height: number; frameRate: number }> = {
  '720p30':  { width: 1280, height: 720,  frameRate: 30 },
  '720p60':  { width: 1280, height: 720,  frameRate: 60 },
  '1080p30': { width: 1920, height: 1080, frameRate: 30 },
  '1080p60': { width: 1920, height: 1080, frameRate: 60 },
  '1440p30': { width: 2560, height: 1440, frameRate: 30 },
}

const VIDEO_STORAGE_KEYS = {
  cameraDeviceId: 'video.camera.deviceId',
  cameraQuality: 'video.camera.quality',
  screenShareQuality: 'video.screenshare.quality',
} as const

export const DEFAULT_CAMERA_QUALITY: VideoQualityPreset = '720p30'
export const DEFAULT_SCREEN_SHARE_QUALITY: VideoQualityPreset = '720p60'

/** Sentinel device id that tells the browser to keep using its default device. */
export const DEFAULT_VOICE_DEVICE_ID = 'default'

// --- Stored device preference keys ---
const storageKeys: Record<VoiceDeviceKind, string> = {
  audioinput: 'voice.audioinput.deviceId',
  audiooutput: 'voice.audiooutput.deviceId',
}

function normalizeDeviceId(deviceId: string | null | undefined): string {
  const trimmed = deviceId?.trim()
  return trimmed ? trimmed : DEFAULT_VOICE_DEVICE_ID
}

function canUseCookies(): boolean {
  return import.meta.client && typeof document !== 'undefined'
}

function getLocalStorageValue(name: string): string | null {
  if (!canUseLocalStorage()) return null

  try {
    return localStorage.getItem(name)
  } catch {
    return null
  }
}

function setLocalStorageValue(name: string, value: string) {
  if (!canUseLocalStorage()) return

  try {
    localStorage.setItem(name, value)
  } catch {
    // Ignore storage failures and fall back to in-memory selection.
  }
}

function getCookieValue(name: string): string | null {
  if (!canUseCookies()) return null

  const encodedName = `${encodeURIComponent(name)}=`
  const parts = document.cookie.split(';')
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed.startsWith(encodedName)) continue
    return decodeURIComponent(trimmed.slice(encodedName.length))
  }

  return null
}

function clearCookieValue(name: string) {
  if (!canUseCookies()) return

  document.cookie = [
    `${encodeURIComponent(name)}=`,
    'Path=/',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'SameSite=Lax',
  ].join('; ')
}

function migrateLegacyCookieValue(name: string): string | null {
  const cookieValue = getCookieValue(name)
  if (!cookieValue) return null

  setLocalStorageValue(name, cookieValue)
  clearCookieValue(name)
  return cookieValue
}

/** Return the preferred device id for a given kind, migrating legacy cookie storage if needed. */
export function getPreferredVoiceDeviceId(kind: VoiceDeviceKind): string {
  const storageKey = storageKeys[kind]

  const storedValue = getLocalStorageValue(storageKey)
  if (storedValue !== null) {
    // Remove any legacy cookie copy so device ids stop riding along on requests.
    clearCookieValue(storageKey)
    return normalizeDeviceId(storedValue)
  }

  return normalizeDeviceId(migrateLegacyCookieValue(storageKey))
}

/** Persist the preferred device id for a given input or output kind. */
export function setPreferredVoiceDeviceId(kind: VoiceDeviceKind, deviceId: string): string {
  const normalizedDeviceId = normalizeDeviceId(deviceId)
  const storageKey = storageKeys[kind]
  setLocalStorageValue(storageKey, normalizedDeviceId)
  clearCookieValue(storageKey)
  return normalizedDeviceId
}

/** Detect whether the current browser supports selecting an audio output device. */
export function supportsSpeakerSelection(): boolean {
  if (!import.meta.client || typeof HTMLMediaElement === 'undefined') return false
  return 'setSinkId' in HTMLMediaElement.prototype
}

/** Enumerate microphone and speaker devices, retrying without prompts when necessary. */
export async function listVoiceAudioDevices(requestPermissions = true): Promise<{
  audioInputs: MediaDeviceInfo[]
  audioOutputs: MediaDeviceInfo[]
}> {
  try {
    const [audioInputs, audioOutputs] = await Promise.all([
      Room.getLocalDevices('audioinput', requestPermissions),
      Room.getLocalDevices('audiooutput', false),
    ])
    return {
      audioInputs,
      audioOutputs,
    }
  } catch (error) {
    if (!requestPermissions) throw error

    // Retry without prompting so settings UIs can still render available device labels.
    const [audioInputs, audioOutputs] = await Promise.all([
      Room.getLocalDevices('audioinput', false),
      Room.getLocalDevices('audiooutput', false),
    ])
    return {
      audioInputs,
      audioOutputs,
    }
  }
}

/** Fall back to the default device id if a saved device no longer exists. */
export function coercePreferredVoiceDeviceId(
  kind: VoiceDeviceKind,
  devices: MediaDeviceInfo[]
): string {
  const preferredDeviceId = getPreferredVoiceDeviceId(kind)
  if (devices.length === 0) {
    return preferredDeviceId
  }

  if (preferredDeviceId === DEFAULT_VOICE_DEVICE_ID) {
    return preferredDeviceId
  }

  const deviceExists = devices.some(device => device.deviceId === preferredDeviceId)
  if (deviceExists) {
    return preferredDeviceId
  }

  return setPreferredVoiceDeviceId(kind, DEFAULT_VOICE_DEVICE_ID)
}

// --- Video device and quality helpers ---

/** Return the preferred camera device id from localStorage. */
export function getPreferredCameraDeviceId(): string {
  return normalizeDeviceId(getLocalStorageValue(VIDEO_STORAGE_KEYS.cameraDeviceId))
}

/** Persist the preferred camera device id. */
export function setPreferredCameraDeviceId(deviceId: string): string {
  const normalized = normalizeDeviceId(deviceId)
  setLocalStorageValue(VIDEO_STORAGE_KEYS.cameraDeviceId, normalized)
  return normalized
}

/** Enumerate available camera devices. */
export async function listVideoDevices(requestPermissions = true): Promise<MediaDeviceInfo[]> {
  try {
    return await Room.getLocalDevices('videoinput', requestPermissions)
  } catch {
    if (!requestPermissions) throw new Error('Kamera aygıtları yüklenemedi')
    return Room.getLocalDevices('videoinput', false)
  }
}

/** Fall back to default if stored camera device no longer exists. */
export function coercePreferredCameraDeviceId(devices: MediaDeviceInfo[]): string {
  const preferred = getPreferredCameraDeviceId()
  if (devices.length === 0 || preferred === DEFAULT_VOICE_DEVICE_ID) return preferred
  const exists = devices.some(d => d.deviceId === preferred)
  return exists ? preferred : setPreferredCameraDeviceId(DEFAULT_VOICE_DEVICE_ID)
}

function isValidVideoQualityPreset(value: string): value is VideoQualityPreset {
  return value in VIDEO_QUALITY_PRESETS
}

/** Return the stored camera quality preset. */
export function getCameraQualityPreset(): VideoQualityPreset {
  const raw = getLocalStorageValue(VIDEO_STORAGE_KEYS.cameraQuality)
  return raw && isValidVideoQualityPreset(raw) ? raw : DEFAULT_CAMERA_QUALITY
}

/** Persist the camera quality preset. */
export function setCameraQualityPreset(preset: VideoQualityPreset): void {
  setLocalStorageValue(VIDEO_STORAGE_KEYS.cameraQuality, preset)
}

/** Return the stored screen share quality preset. */
export function getScreenShareQualityPreset(): VideoQualityPreset {
  const raw = getLocalStorageValue(VIDEO_STORAGE_KEYS.screenShareQuality)
  return raw && isValidVideoQualityPreset(raw) ? raw : DEFAULT_SCREEN_SHARE_QUALITY
}

/** Persist the screen share quality preset. */
export function setScreenShareQualityPreset(preset: VideoQualityPreset): void {
  setLocalStorageValue(VIDEO_STORAGE_KEYS.screenShareQuality, preset)
}
