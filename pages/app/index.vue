<script setup lang="ts">
import { devLog } from '@/src/utils/safeLogger'
import { useAppStore } from '~/stores/app'

definePageMeta({
    layout: 'app',
    middleware: 'auth',
    title: 'Kergit'
})

const app = useAppStore()

function applyHomeState() {
    app.activeHubId = null
    app.activeChannelId = null
    app.viewedHubId = null
    app.viewingVoiceGrid = false
}

const hasHubs = computed(() => app.hubs.length > 0)
const hubPreview = computed(() => app.hubs.slice(0, 6))

watch(
    () => [app.activeHubId, app.activeChannelId, app.viewedHubId] as const,
    ([activeHubId, activeChannelId, viewedHubId]) => {
        if (activeHubId === null && activeChannelId === null && viewedHubId === null) return
        applyHomeState()
    },
    { immediate: true }
)

onMounted(() => {
    applyHomeState()
    devLog('[page:app] loaded (home state)')
})
</script>

<template>
    <section class="app-home">
        <div class="home-card home-intro">
            <p class="home-kicker">ANA SAYFA</p>
            <h1 class="home-title">Kergit'e Hoş Geldin</h1>
            <p class="home-copy">
                Sohbete başlamak için soldaki raydan bir sunucu seç veya artıyla yeni bir sunucu oluştur.
            </p>
        </div>

        <div class="home-card home-hubs">
            <h2 class="home-section-title">Sunucuların</h2>
            <p v-if="!hasHubs" class="home-copy">
                Henüz hiçbir sunucuda değilsin. Raydaki artı düğmesini kullanarak sunucu oluşturabilir veya katılabilirsin.
            </p>
            <div v-else class="hub-grid">
                <NuxtLink
                    v-for="hub in hubPreview"
                    :key="hub.id"
                    class="hub-link"
                    :to="`/channels/${hub.id}`"
                >
                    <span class="hub-name">{{ hub.name }}</span>
                    <span class="hub-meta">{{ hub.channels_count }} kanal</span>
                </NuxtLink>
            </div>
        </div>
    </section>
</template>

<style scoped>
.app-home {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    overflow: auto;
}

.home-card {
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(15, 18, 24, 0.72);
    border-radius: 14px;
    padding: 20px;
}

.home-kicker {
    margin: 0 0 6px;
    color: #67e8f9;
    font-size: 11px;
    letter-spacing: 0.12em;
    font-weight: 700;
}

.home-title {
    margin: 0;
    color: #f8fafc;
    font-size: 28px;
    line-height: 1.1;
    font-weight: 700;
}

.home-section-title {
    margin: 0 0 8px;
    color: #f8fafc;
    font-size: 16px;
    line-height: 1.2;
    font-weight: 700;
}

.home-copy {
    margin: 8px 0 0;
    color: rgba(226, 232, 240, 0.86);
    font-size: 14px;
    line-height: 1.5;
}

.hub-grid {
    margin-top: 8px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 10px;
}

.hub-link {
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(10, 13, 18, 0.55);
    padding: 12px;
    text-decoration: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
    transition: border-color 120ms ease, transform 120ms ease;
}

.hub-link:hover {
    border-color: rgba(103, 232, 249, 0.6);
    transform: translateY(-1px);
}

.hub-name {
    color: #e2e8f0;
    font-size: 14px;
    line-height: 1.3;
    font-weight: 600;
}

.hub-meta {
    color: rgba(148, 163, 184, 0.95);
    font-size: 12px;
    line-height: 1.3;
}
</style>
