export default defineNuxtPlugin(() => {
  const isProduction = process.env.NODE_ENV === 'production'
  if (!isProduction) return

  // Browser-only plugin (.client.ts): silences all console output in production
  // as defense-in-depth so no client code can accidentally print tokens,
  // sessions, or errors to the browser console. Server-side diagnostics
  // (logServerError → console.error in Nitro) are unaffected.
  const noop = (..._args: unknown[]) => {}
  console.log = noop
  console.info = noop
  console.warn = noop
  console.debug = noop
  console.error = noop
})
