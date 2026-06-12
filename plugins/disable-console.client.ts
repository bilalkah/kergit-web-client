export default defineNuxtPlugin(() => {
  const isProduction = process.env.NODE_ENV === 'production'
  if (!isProduction) return

  const noop = (..._args: unknown[]) => {}
  console.log = noop
  console.warn = noop
  console.debug = noop
})
