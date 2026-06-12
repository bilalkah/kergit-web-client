<script setup lang="ts">
import { protoService } from '@/src/services/proto'
import { SocketState, useWebSocket } from '~/composables/useWebSocket'
import { useToast } from '~/composables/useToast'
import { useAppStore } from '~/stores/app'
import { useAuthStore } from '~/stores/auth'

definePageMeta({
    title: 'Davet | Kergit',
})

const PENDING_INVITE_KEY = 'kergit.pendingInvite'

enum InviteState {
    Connecting = 'connecting',
    Validating = 'validating',
    Ready = 'ready',
    Joining = 'joining',
    Invalid = 'invalid',
}

const route = useRoute()
const auth = useAuthStore()
const app = useAppStore()
const socket = useWebSocket()

const token = computed(() => {
    const raw = route.params.token
    return typeof raw === 'string' ? raw : Array.isArray(raw) ? (raw[0] ?? '') : ''
})

const inviteState = ref<InviteState>(InviteState.Connecting)
const errorText = ref('')
const previewHubName = ref('')
const hubJoinType = ref(protoService.EnvelopeType.HUB_JOIN as number)
const hubInviteValidateType = ref(protoService.EnvelopeType.HUB_INVITE_VALIDATE as number)

// Ask the server whether the invite is valid before offering a Join button.
async function validateInvite() {
    if (!token.value) {
        errorText.value = 'Davet bağlantısı geçersiz.'
        inviteState.value = InviteState.Invalid
        return
    }
    inviteState.value = InviteState.Validating
    errorText.value = ''
    socket.lastInvitePreview.value = null
    app.clearCommandError(hubInviteValidateType.value)
    await socket.validateHubInvite(token.value)
}

async function handleJoin() {
    if (inviteState.value !== InviteState.Ready || !token.value) return
    inviteState.value = InviteState.Joining
    errorText.value = ''
    app.clearCommandError(hubJoinType.value)
    await socket.joinHub(token.value)
}

function handleClose() {
    navigateTo(auth.isAuthenticated ? '/app' : '/')
}

// On mount: check auth, connect socket, validate invite
onMounted(async () => {
    if (auth.initPromise) {
        await auth.initPromise
    }

    if (!auth.isAuthenticated) {
        if (import.meta.client) {
            try {
                localStorage.setItem(PENDING_INVITE_KEY, token.value)
            } catch {
                // ignore
            }
        }
        await navigateTo('/login')
        return
    }

    // Ensure WebSocket is connected (this page doesn't use the app layout)
    if (socket.state.value !== SocketState.READY) {
        await socket.connect({ timeoutMs: 15000 })
    }
    await validateInvite()
})

// Also validate in case connect resolves after mount
watch(
    () => socket.state.value,
    (s) => {
        if (s === SocketState.READY && inviteState.value === InviteState.Connecting) {
            void validateInvite()
        }
    },
)

// Valid invite preview received -> offer Join
watch(
    () => socket.lastInvitePreview.value,
    (preview) => {
        if (!preview) return
        if (inviteState.value !== InviteState.Validating) return
        previewHubName.value = preview.hubName
        inviteState.value = InviteState.Ready
    },
)

// Watch for join success (STATE_SYNC merge applied)
watch(
    () => app.lastHubEventAt,
    (stamp) => {
        if (!stamp || inviteState.value !== InviteState.Joining) return
        navigateTo('/app')
    },
)

// Watch for validate/join errors -> show invalid immediately
watch(
    () => app.commandErrors,
    () => {
        if (inviteState.value === InviteState.Validating) {
            const entry = app.commandErrors[hubInviteValidateType.value]
            if (!entry) return
            errorText.value = entry.message
            inviteState.value = InviteState.Invalid
            return
        }
        if (inviteState.value === InviteState.Joining) {
            const entry = app.commandErrors[hubJoinType.value]
            if (!entry) return
            errorText.value = entry.message
            inviteState.value = InviteState.Invalid
            useToast().show(entry.message, 'error')
        }
    },
    { deep: true },
)
</script>

<template>
    <div class="invite-page">
        <div class="invite-card">
            <h1 class="invite-title">Sunucu Daveti</h1>

            <!-- Connecting -->
            <template v-if="inviteState === InviteState.Connecting">
                <p class="invite-desc">Bağlantı kuruluyor...</p>
            </template>

            <!-- Validating invite -->
            <template v-else-if="inviteState === InviteState.Validating">
                <p class="invite-desc">Davet doğrulanıyor...</p>
            </template>

            <!-- Ready to join (valid invite) -->
            <template v-else-if="inviteState === InviteState.Ready">
                <p class="invite-desc">
                    <template v-if="previewHubName">
                        <strong>{{ previewHubName }}</strong> sunucusuna katılmak üzeresin.
                    </template>
                    <template v-else>
                        Bu daveti kabul ederek sunucuya katılabilirsiniz.
                    </template>
                </p>
                <div class="invite-actions">
                    <button class="invite-btn primary" type="button" @click="handleJoin">
                        Sunucuya Katıl
                    </button>
                </div>
            </template>

            <!-- Joining -->
            <template v-else-if="inviteState === InviteState.Joining">
                <p class="invite-desc">Katılıyor...</p>
            </template>

            <!-- Invalid / expired invite -->
            <template v-else-if="inviteState === InviteState.Invalid">
                <p class="invite-error">{{ errorText || 'Bu davet bağlantısı geçersiz veya süresi dolmuş.' }}</p>
                <div class="invite-actions">
                    <button class="invite-btn ghost" type="button" @click="handleClose">
                        Kapat
                    </button>
                </div>
            </template>
        </div>
    </div>
</template>

<style scoped>
.invite-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0f1117;
    color: #eef4ff;
    padding: 20px;
}

.invite-card {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 32px;
    max-width: 400px;
    width: 100%;
    text-align: center;
}

.invite-title {
    font-size: 20px;
    font-weight: 700;
    margin: 0 0 16px;
}

.invite-desc {
    font-size: 14px;
    color: #94a3b8;
    margin: 0 0 24px;
}

.invite-error {
    font-size: 14px;
    color: #f87171;
    margin: 0 0 20px;
}

.invite-actions {
    display: flex;
    justify-content: center;
    gap: 10px;
}

.invite-btn {
    border: 0;
    border-radius: 10px;
    padding: 10px 24px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.16s ease;
}

.invite-btn.primary {
    color: #efe7ff;
    background: rgba(124, 58, 237, 0.32);
}

.invite-btn.primary:hover {
    background: rgba(124, 58, 237, 0.5);
}

.invite-btn.ghost {
    color: #d1d9e8;
    background: rgba(255, 255, 255, 0.08);
}

.invite-btn.ghost:hover {
    background: rgba(255, 255, 255, 0.14);
}
</style>
