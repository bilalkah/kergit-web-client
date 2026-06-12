<script setup lang="ts">
import MessageList from '~/components/ui/MessageList.vue'
import { SocketState, useWebSocket } from '~/composables/useWebSocket'
import { useAppStore, ChannelType, HubRole } from '~/stores/app'

definePageMeta({
    layout: 'app',
    middleware: ['auth', 'hub-access'],
    title: 'Kergit',
})

const route = useRoute()
const socket = useWebSocket()
const app = useAppStore()

enum HubLandingState {
    Ready = 'ready',
    NoChannels = 'no-channels',
    HubNotFound = 'hub-not-found',
}

const state = ref<HubLandingState>(HubLandingState.Ready)
const redirectInFlight = ref(false)

const hubId = computed(() => {
    const raw = route.params.hubId
    if (typeof raw === 'string') return raw
    if (Array.isArray(raw)) return raw[0] ?? ''
    return ''
})

const currentHub = computed(() => {
    if (!hubId.value) return null
    return app.hubs.find(hub => hub.id === hubId.value) ?? null
})

const firstTextChannelId = computed(() => {
    if (!hubId.value) return null
    const channels = app.channelsByHub[hubId.value] ?? []
    return channels.find(channel => channel.type === ChannelType.Text)?.id ?? null
})

const canCreateChannel = computed(() => {
    const role = currentHub.value?.role
    return role === HubRole.Owner || role === HubRole.Admin
})

async function resolveHubLanding() {
    if (redirectInFlight.value) return

    const id = hubId.value
    if (!id) {
        state.value = HubLandingState.HubNotFound
        return
    }

    app.activeHubId = id
    app.viewHub(id)

    const hasHubSnapshot =
        app.hubs.some(hub => hub.id === id) ||
        Object.prototype.hasOwnProperty.call(app.channelsByHub, id)
    if (!hasHubSnapshot && socket.state.value !== SocketState.READY) {
        state.value = HubLandingState.Ready
        return
    }

    if (!hasHubSnapshot) {
        app.activeChannelId = null
        state.value = HubLandingState.HubNotFound
        return
    }

    if (firstTextChannelId.value) {
        state.value = HubLandingState.Ready
        redirectInFlight.value = true
        try {
            await navigateTo(`/channels/${id}/${firstTextChannelId.value}`, { replace: true })
        } finally {
            redirectInFlight.value = false
        }
        return
    }

    app.activeChannelId = null
    state.value = HubLandingState.NoChannels
}

watch(
    [
        hubId,
        () => socket.state.value,
        () => app.hubs.length,
        firstTextChannelId,
    ],
    () => {
        void resolveHubLanding()
    },
    { immediate: true }
)
</script>

<template>
    <section v-if="state === HubLandingState.HubNotFound || state === HubLandingState.NoChannels" class="hub-landing-page">
        <div v-if="state === HubLandingState.HubNotFound" class="ui-state-card">
            <div class="ui-state-title">Sunucu bulunamadi</div>
            <p class="ui-state-copy">Bu sunucuya erisimin olmayabilir ya da sunucu kaldirilmis olabilir.</p>
            <NuxtLink to="/app" class="ui-state-link">Uygulama ana sayfasina don</NuxtLink>
        </div>

        <div v-else class="ui-state-card">
            <div class="ui-state-title">Henuz metin kanali yok</div>
            <p v-if="canCreateChannel" class="state-tip">
                Sunucu yoneticisi oldugun icin ilk metin kanalini olusturabilirsin.
                Sol panelde sunucu menusunden <strong>Kanal olustur</strong> secenegini kullan.
            </p>
        </div>
    </section>

    <section v-else class="channel-page">
        <MessageList />
    </section>
</template>

<style scoped>
.channel-page {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
}

.hub-landing-page {
    height: 100%;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
}

.state-actions {
    margin-top: 4px;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
}

.state-tip {
    margin: 2px 0 0;
    color: rgba(148, 163, 184, 0.95);
    font-size: 13px;
    line-height: 1.5;
}
</style>
