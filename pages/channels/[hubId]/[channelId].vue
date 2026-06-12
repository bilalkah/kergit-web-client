<script setup lang="ts">
import MessageList from '~/components/ui/MessageList.vue'
import { SocketState, useWebSocket } from '~/composables/useWebSocket'
import { useAppStore, ChannelType } from '~/stores/app'

definePageMeta({
    layout: 'app',
    middleware: ['auth', 'hub-access'],
    title: 'Kergit',
})

enum ChannelRouteState {
    Loading = 'loading',
    Ready = 'ready',
    HubNotFound = 'hub-not-found',
}

const route = useRoute()
const socket = useWebSocket()
const app = useAppStore()

const hubId = computed(() => {
    const raw = route.params.hubId
    if (typeof raw === 'string') return raw
    if (Array.isArray(raw)) return raw[0] ?? ''
    return ''
})

const state = ref<ChannelRouteState>(ChannelRouteState.Ready)
const redirectInFlight = ref(false)

const hasHubTopology = computed(() => {
    if (!hubId.value) return false
    if (app.hubs.some(hub => hub.id === hubId.value)) return true
    return Object.prototype.hasOwnProperty.call(app.channelsByHub, hubId.value)
})

const channelId = computed(() => {
    const raw = route.params.channelId
    if (typeof raw === 'string') return raw
    if (Array.isArray(raw)) return raw[0] ?? ''
    return ''
})

const hubExists = computed(() => {
    return hasHubTopology.value
})

const textChannel = computed(() => {
    if (!hubId.value || !channelId.value) return null
    const channels = app.channelsByHub[hubId.value] ?? []
    return channels.find(channel => channel.id === channelId.value && channel.type === ChannelType.Text) ?? null
})

const waitingFirstFetch = computed(() => {
    const id = channelId.value
    if (!id) return false
    if (!textChannel.value) return false
    if (socket.state.value !== SocketState.READY) return false
    return !app.hasChannelInitialFetchCompleted(id)
})

async function redirectTo(path: string) {
    if (redirectInFlight.value) return
    redirectInFlight.value = true
    try {
        await navigateTo(path, { replace: true })
    } finally {
        redirectInFlight.value = false
    }
}

async function syncChannelFromRoute() {
    if (redirectInFlight.value) return

    const nextHubId = hubId.value
    const nextChannelId = channelId.value
    const prevHubId = app.activeHubId
    const prevChannelId = app.activeChannelId

    if (!nextHubId) {
        await redirectTo('/app')
        return
    }

    app.activeHubId = nextHubId
    app.viewHub(nextHubId)

    // Preserve URL channel intent across hard refresh before bootstrap finishes.
    // This lets state-sync keep the correct active channel instead of defaulting
    // to the hub's first text channel.
    if (nextChannelId && socket.state.value !== SocketState.READY) {
        app.activeChannelId = nextChannelId
    }

    if (!hubExists.value) {
        if (socket.state.value !== SocketState.READY) {
            state.value = ChannelRouteState.Ready
            return
        }
        app.activeChannelId = null
        await redirectTo('/app')
        return
    }

    // Invalid or missing channel — let the hub landing page handle it
    if (!nextChannelId || !textChannel.value) {
        if (socket.state.value !== SocketState.READY) {
            state.value = ChannelRouteState.Ready
            return
        }
        app.activeChannelId = null
        await redirectTo(`/channels/${nextHubId}`)
        return
    }

    const shouldNotifySocket =
        prevHubId !== nextHubId ||
        prevChannelId !== nextChannelId ||
        !app.hasChannelInitialFetchCompleted(nextChannelId)
    app.setActiveChannel(nextHubId, nextChannelId)
    app.viewHub(nextHubId)
    state.value = waitingFirstFetch.value ? ChannelRouteState.Loading : ChannelRouteState.Ready

    if (shouldNotifySocket && socket.state.value === SocketState.READY) {
        void socket.sendActiveChannel(nextHubId, nextChannelId)
    }
}

watch(
    [
        hubId,
        channelId,
        hubExists,
        textChannel,
        () => app.hasChannelInitialFetchCompleted(channelId.value),
        () => socket.state.value,
        () => app.hubs.length,
        () => app.channelsByHub[hubId.value]?.length ?? -1,
    ],
    () => {
        void syncChannelFromRoute()
    },
    { immediate: true }
)
</script>

<template>
    <section v-if="state === ChannelRouteState.Loading" class="channel-state-page">
        <div class="ui-state-card">
            <div class="ui-state-title">Yukleniyor...</div>
            <p class="ui-state-copy">Kanal verisi aliniyor.</p>
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

.channel-state-page {
    height: 100%;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
}
</style>
