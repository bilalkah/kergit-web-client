import { devWarn } from '@/src/utils/safeLogger'
import { ChannelType } from '~/stores/app'

function asParam(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : ''
  return ''
}

export default defineNuxtRouteMiddleware((to) => {
  // The membership snapshot is client-driven; defer server-side checks.
  if (import.meta.server) {
    return
  }

  const { $pinia } = useNuxtApp()
  const app = useAppStore($pinia)

  const hubId = asParam(to.params.hubId)
  const channelId = asParam(to.params.channelId)

  if (!hubId) {
    return navigateTo('/app', { replace: true })
  }

  // Do not hard-block before bootstrap populates hubs/channels.
  const hasHubSnapshot =
    app.hubs.length > 0 ||
    Object.keys(app.channelsByHub).length > 0
  if (!hasHubSnapshot) {
    return
  }

  const hasHubAccess =
    app.hubs.some((hub) => hub.id === hubId) ||
    Object.prototype.hasOwnProperty.call(app.channelsByHub, hubId)
  if (!hasHubAccess) {
    devWarn('[middleware:hub-access] blocked hub access', {
      path: to.path,
      hubId,
    })
    return navigateTo('/app', { replace: true })
  }

  if (!channelId) {
    return
  }

  // Navigating to a text channel route — hide the voice grid
  app.hideVoiceGrid()

  const channels = app.channelsByHub[hubId] ?? []
  if (channels.length === 0) {
    // Channel snapshot for this hub may not be hydrated yet.
    return
  }
  const hasTextChannelAccess = channels.some(
    (channel) => channel.id === channelId && channel.type === ChannelType.Text
  )

  if (!hasTextChannelAccess) {
    devWarn('[middleware:hub-access] blocked channel access', {
      path: to.path,
      hubId,
      channelId,
    })
    return navigateTo(`/channels/${hubId}`, { replace: true })
  }
})
