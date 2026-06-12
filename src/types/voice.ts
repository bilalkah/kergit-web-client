/** Tile display mode in the voice grid. */
export enum TileMode {
  Participant = 'participant',
  ScreenShare = 'screenshare',
}

/** Voice grid timing and layout constants. */
export const VOICE_GRID = {
  PAGE_SIZE: 9,
  MOUSE_IDLE_MS: 3000,
  REFRESH_DEBOUNCE_MS: 50,
  TRACK_POLL_INTERVAL_MS: 200,
  TRACK_POLL_MAX_ATTEMPTS: 25,
} as const

/** Volume slider constraints. */
export const VOLUME = {
  MIN: 0,
  MAX: 200,
  DEFAULT: 100,
} as const
