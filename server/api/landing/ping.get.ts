import { defineEventHandler, setResponseHeader } from 'h3'

type PingAckResponse = {
  ok: boolean
  timestampMs: number
}

export default defineEventHandler((event): PingAckResponse => {
  // Prevent edge/browser caches so each request can be timed as a fresh RTT sample.
  setResponseHeader(event, 'cache-control', 'no-store, no-cache, must-revalidate, max-age=0')
  setResponseHeader(event, 'pragma', 'no-cache')
  setResponseHeader(event, 'expires', '0')

  return {
    ok: true,
    timestampMs: Date.now(),
  }
})
