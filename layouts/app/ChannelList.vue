<script setup lang="ts">
import { useAppStore, ChannelType, HubRole } from '~/stores/app'
import { SocketState, useWebSocket } from '~/composables/useWebSocket'
import { isVoiceConnected, setParticipantVolume } from '@/src/services/webrtc/livekit'
import { protoService } from '@/src/services/proto'
import { toProtoHubRole } from '@/src/utils/hubRole'
import { devWarn } from '@/src/utils/safeLogger'
import SidebarSectionHeader from '~/components/ui/SidebarSectionHeader.vue'
import HubHeader from '~/components/ui/HubHeader.vue'
import ChannelItem from '~/components/ui/ChannelItem.vue'
import ProfileCard from '~/components/ui/ProfileCard.vue'
import VoiceParticipantCard from '~/components/ui/VoiceParticipantCard.vue'
import Skeleton from '~/components/ui/Skeleton.vue'
import EmptyState from '~/components/ui/EmptyState.vue'
import CreateChannelModal from '../../components/ui/modals/CreateChannelModal.vue'
import ChannelSettingsModal from '../../components/ui/modals/ChannelSettingsModal.vue'
import HubSettingsModal from '../../components/ui/modals/HubSettingsModal.vue'
import { IconClose, IconTextChannel } from '~/components/icons/Common'

defineOptions({
    inheritAttrs: false,
})

const props = defineProps<{
    mobileMode?: boolean
}>()

const emit = defineEmits<{
    close: []
}>()

const app = useAppStore()
const socket = useWebSocket()
const attrs = useAttrs()
const route = useRoute()

const canManage = computed(() => {
    const role = app.viewedHub?.role
    return role === HubRole.Admin || role === HubRole.Owner
})

const hubRole = computed(() => app.viewedHub?.role ?? 'member')
const canSettings = computed(() => hubRole.value === HubRole.Admin || hubRole.value === HubRole.Owner)
const canDeleteHub = computed(() => hubRole.value === HubRole.Owner)
const canDeleteChannel = computed(() => hubRole.value === HubRole.Owner)

const inviteOpen = ref(false)
const settingsOpen = ref(false)
const createChannelOpen = ref(false)
const inviteLoading = ref(false)
const inviteError = ref('')
const inviteCode = ref('')
const inviteHubId = ref('')

const renameValue = ref('')
const renameError = ref('')
const deleteConfirm = ref(false)
const avatarError = ref('')
const selectedAvatarSeed = ref('')
const createChannelName = ref('')
const createChannelType = ref<ChannelType>(ChannelType.Text)
const createChannelError = ref('')
const createChannelSubmitting = ref(false)
const createChannelInitialCount = ref(0)
const createChannelHubId = ref('')

const channelSettingsOpen = ref(false)
const channelRenameValue = ref('')
const channelRenameError = ref('')
const selectedChannelId = ref('')
const channelDeleteConfirm = ref(false)
const channelDeleteError = ref('')
const textSectionCollapsed = ref(false)
const voiceSectionCollapsed = ref(false)
type ActiveUserCardMode = 'profile' | 'voice-controls'
const activeUserCard = ref<{
    mode: ActiveUserCardMode
    userId: string
    x: number
    y: number
    voiceChannelId?: string | null
} | null>(null)

const SECTION_STATE_KEY_TEXT = 'kergit:ui:channels:text-collapsed'
const SECTION_STATE_KEY_VOICE = 'kergit:ui:channels:voice-collapsed'

// Voice switch confirmation dialog
const voiceSwitchConfirmOpen = ref(false)
const pendingVoiceSwitch = ref<{ hubId: string; channelId: string; channelName: string } | null>(null)

const CHANNEL_TYPE_TEXT = 1
const CHANNEL_TYPE_VOICE = 2

const avatarSeeds = [
    'Felix',
    'Nova',
    'Orbit',
    'Pixel',
    'Bolt',
    'Echo',
    'Luna',
    'Atlas',
    'Milo',
    'Sage',
    'Rex',
    'Zara',
]

const hubInviteType = ref(52)
const hubRemoveType = ref(54)
const hubUpdateType = ref(56)
const hubMemberKickType = ref(55)
const hubMemberRoleUpdateType = ref(57)
const voiceKickParticipantType = ref(34)
const channelCreateType = ref(80)
const channelRenameType = ref(81)
const channelRemoveType = ref(85)

const currentHubName = computed(() => app.viewedHub?.name.trim() ?? '')
const currentHubAvatarSeed = computed(() => app.viewedHub?.avatar_seed?.trim() || 'Felix')

const hubHasChanges = computed(() => {
    const trimmedName = renameValue.value.trim()
    const trimmedAvatar = selectedAvatarSeed.value.trim()
    return trimmedName !== currentHubName.value || trimmedAvatar !== currentHubAvatarSeed.value
})

const currentChannelName = computed(() => {
    if (!selectedChannelId.value) return ''
    const channel = app.viewedChannels.find(ch => ch.id === selectedChannelId.value)
    return channel?.name?.trim() ?? ''
})

const currentVoiceChannelName = computed(() => {
    if (!app.activeVoiceChannelId) return ''
    // Look through all hubs for the channel
    for (const hubId of Object.keys(app.channelsByHub)) {
        const channels = app.channelsByHub[hubId] ?? []
        const channel = channels.find(ch => ch.id === app.activeVoiceChannelId)
        if (channel) return channel.name?.trim() ?? 'Ses kanalı'
    }
    return 'Ses kanalı'
})

const channelHasChanges = computed(() => {
    if (!selectedChannelId.value) return false
    return channelRenameValue.value.trim() !== currentChannelName.value
})

const textChannels = computed(() =>
    app.viewedChannels.filter(channel => channel.type === ChannelType.Text)
)

const voiceChannels = computed(() =>
    app.viewedChannels.filter(channel => channel.type === ChannelType.Voice)
)

const showHubLoading = computed(() =>
    socket.state.value === SocketState.LOADING && app.viewedChannels.length === 0
)

const emptyStateTitle = computed(() =>
    app.viewedHub ? 'Henüz kanal yok' : 'Henüz sunucu seçilmedi'
)

const emptyStateMessage = computed(() =>
    app.viewedHub
        ? 'Sohbet için bir metin ya da ses kanalı oluştur.'
        : 'Sohbete başlamak için soldaki listeden bir sunucu seç.'
)

const emptyStateActionText = computed(() =>
    app.viewedHub && canManage.value ? 'Kanal Oluştur' : ''
)

const hasActiveVoice = computed(() => app.hasLocalActiveVoice)

async function openChannel(channelId: string) {
    const hubId = app.viewedHubId
    if (!hubId) return
    const channel = app.viewedChannels.find(ch => ch.id === channelId)
    const isVoice = channel?.type === ChannelType.Voice

    if (isVoice) {
        if (hasActiveVoice.value &&
            app.activeVoiceChannelId === channelId &&
            app.activeVoiceHubId === hubId) {
            if (isVoiceConnected()) {
                app.showVoiceGrid()
                return
            }
            app.clearActiveVoiceChannel()
        }
        if (app.voiceConnectedElsewhere) {
            app.setPendingVoiceTakeover({
                hubId,
                channelId,
                reason: 'takeover',
            })
            return
        }
        // If already in a voice channel, show confirmation dialog
        if (hasActiveVoice.value && app.activeVoiceChannelId && app.activeVoiceHubId) {
            pendingVoiceSwitch.value = { hubId, channelId, channelName: channel?.name ?? 'Ses kanalı' }
            voiceSwitchConfirmOpen.value = true
            return
        }
        // Not in any voice channel, join directly
        app.setActiveVoiceChannel(hubId, channelId)
        app.showVoiceGrid()
        void socket.requestVoiceTransition({
            hubId,
            channelId,
            force: true,
            source: 'channel_list',
        })
    } else {
        app.hideVoiceGrid()
        const targetPath = `/channels/${hubId}/${channelId}`
        if (route.path !== targetPath) {
            await navigateTo(targetPath)
        }
    }

    // On mobile, switch to chat panel after selecting a channel
    if (props.mobileMode && !isVoice) {
        app.closeMobilePanels()
    }
}

function closeVoiceSwitchConfirm() {
    voiceSwitchConfirmOpen.value = false
    pendingVoiceSwitch.value = null
}

function onShowVoiceProfile(channelId: string, payload: { userId: string; x: number; y: number }) {
    activeUserCard.value = {
        mode: 'profile',
        ...payload,
        voiceChannelId: channelId,
    }
}

function onShowVoiceControls(channelId: string, payload: { userId: string; x: number; y: number }) {
    activeUserCard.value = {
        mode: 'voice-controls',
        ...payload,
        voiceChannelId: channelId,
    }
}

const closeProfile = () => {
    activeUserCard.value = null
}

const onUpdateRole = async (payload: { userId: string; hubId: string; role: 'admin' | 'member' }) => {
    app.clearCommandError(hubMemberRoleUpdateType.value)
    await socket.updateHubMemberRole(payload.hubId, payload.userId, toProtoHubRole(payload.role))
    closeProfile()
}

const onKickUser = async (payload: { userId: string; hubId: string }) => {
    app.clearCommandError(hubMemberKickType.value)
    await socket.kickHubMember(payload.hubId, payload.userId)
    closeProfile()
}

const onKickUserFromVoice = async (payload: { userId: string; hubId: string; channelId: string }) => {
    app.clearCommandError(voiceKickParticipantType.value)
    await socket.kickVoiceParticipant(payload.hubId, payload.channelId, payload.userId)
    closeProfile()
}

async function onSetUserVolume(payload: { userId: string; volumePercent: number }) {
    app.setUserVolumeOverride(payload.userId, payload.volumePercent)
    try {
        setParticipantVolume(payload.userId, payload.volumePercent)
    } catch (error) {
        devWarn('[voice] failed to update participant volume', error)
    }
}

function toggleTextSection() {
    textSectionCollapsed.value = !textSectionCollapsed.value
}

function toggleVoiceSection() {
    voiceSectionCollapsed.value = !voiceSectionCollapsed.value
}

function confirmVoiceSwitch() {
    if (!pendingVoiceSwitch.value) return
    const { hubId, channelId } = pendingVoiceSwitch.value

    app.setActiveVoiceChannel(hubId, channelId)
    app.showVoiceGrid()
    void socket.requestVoiceTransition({
        hubId,
        channelId,
        force: true,
        source: 'voice_switch_confirm',
    })

    closeVoiceSwitchConfirm()
}

const voiceParticipantsForChannel = (channelId: string) => {
    const hubId = app.viewedHubId
    if (!hubId) return []
    const ids = app.voiceParticipantsByChannel[channelId] ?? []
    if (ids.length === 0) return []
    const members = app.membersByHub[hubId] ?? []
    return ids
        .map(id => {
            const userInfo = app.getUserInfo(hubId, id)
            const member = members.find(entry => entry.user_id === id)
            const state = app.voiceStatesByUser[id] ?? { muted: false, deafened: false }
            return {
                userId: id,
                displayName: app.getUserDisplayName(hubId, id),
                role: member?.role,
                avatarSeed: userInfo?.avatar_seed,
                speaking: app.isUserSpeaking(id),
                muted: state.muted,
                deafened: state.deafened,
            }
        })
        .filter(Boolean) as Array<{
            userId: string
            displayName: string
            role?: string
            avatarSeed?: string
            speaking: boolean
            muted: boolean
            deafened: boolean
        }>
}

const voiceStartedAtUnixForChannel = (channelId: string): number =>
    app.getVoiceChannelStartedAtUnix(channelId)

function onChannelSettings(channel: any) {
    if (!channel) return
    channelSettingsOpen.value = true
    selectedChannelId.value = channel.id
    channelRenameValue.value = channel.name
    channelRenameError.value = ''
    channelDeleteConfirm.value = false
    channelDeleteError.value = ''
    app.clearCommandError(channelRenameType.value)
    app.clearCommandError(channelRemoveType.value)
}

function openInvite() {
    if (!app.viewedHubId) return
    inviteOpen.value = true
    inviteHubId.value = app.viewedHubId
    inviteLoading.value = true
    inviteError.value = ''
    inviteCode.value = ''
    app.clearCommandError(hubInviteType.value)
    if (!socket.connected.value) {
        inviteLoading.value = false
        inviteError.value = 'Bağlantı hazır değil'
        return
    }
    const existing = app.hubJoinCodes[inviteHubId.value]
    if (existing) {
        inviteCode.value = existing
        inviteLoading.value = false
        return
    }
    void socket.createHubJoinCode(inviteHubId.value)
}

function openSettings() {
    if (!app.viewedHub) return
    settingsOpen.value = true
    renameValue.value = app.viewedHub.name
    renameError.value = ''
    avatarError.value = ''
    selectedAvatarSeed.value = app.viewedHub.avatar_seed?.trim() || 'Felix'
    deleteConfirm.value = false
    app.clearCommandError(hubUpdateType.value)
    app.clearCommandError(hubRemoveType.value)
}

function openCreateChannel() {
    if (!app.viewedHubId || !canSettings.value) return
    createChannelOpen.value = true
    createChannelName.value = ''
    createChannelType.value = ChannelType.Text
    createChannelError.value = ''
    createChannelSubmitting.value = false
    createChannelHubId.value = app.viewedHubId
    createChannelInitialCount.value =
        app.channelsByHub[createChannelHubId.value]?.length ?? 0
    app.clearCommandError(channelCreateType.value)
}

function closeInvite() {
    inviteOpen.value = false
    inviteLoading.value = false
    inviteError.value = ''
    inviteCode.value = ''
    inviteHubId.value = ''
}

function closeSettings() {
    settingsOpen.value = false
    renameError.value = ''
    avatarError.value = ''
    deleteConfirm.value = false
}

function closeCreateChannel() {
    createChannelOpen.value = false
    createChannelError.value = ''
    createChannelSubmitting.value = false
    createChannelInitialCount.value = 0
    createChannelHubId.value = ''
}

function closeChannelSettings() {
    channelSettingsOpen.value = false
    channelRenameError.value = ''
    selectedChannelId.value = ''
    channelDeleteConfirm.value = false
    channelDeleteError.value = ''
}

async function onLeaveHub() {
    if (!app.viewedHubId) return
    await socket.leaveHub(app.viewedHubId)
}

async function onDeleteHub() {
    if (!app.viewedHubId) return
    if (!deleteConfirm.value) {
        deleteConfirm.value = true
        return
    }
    app.clearCommandError(hubRemoveType.value)
    await socket.removeHub(app.viewedHubId)
}

async function onSaveHubSettings() {
    if (!app.viewedHubId || !app.viewedHub) return
    if (!canSettings.value) return

    const trimmedName = renameValue.value.trim()
    const trimmedAvatar = selectedAvatarSeed.value.trim()
    const currentName = currentHubName.value
    const currentAvatar = currentHubAvatarSeed.value

    const opts: { name?: string; avatar_seed?: string } = {}
    renameError.value = ''
    avatarError.value = ''

    if (trimmedName !== currentName) {
        if (!trimmedName) {
            renameError.value = 'Sunucu adı gerekli'
            return
        }
        opts.name = trimmedName
    }

    if (trimmedAvatar !== currentAvatar) {
        if (!trimmedAvatar) {
            avatarError.value = 'Bir avatar seç'
            return
        }
        opts.avatar_seed = trimmedAvatar
    }

    if (!opts.name && !opts.avatar_seed) {
        closeSettings()
        return
    }

    app.clearCommandError(hubUpdateType.value)
    await socket.updateHubSettings(app.viewedHubId, opts)
    closeSettings()
}

const normalizeChannelName = (name: string): string => name.trim().toLowerCase()

async function onCreateChannel() {
    if (!app.viewedHubId || !canSettings.value) return
    if (createChannelSubmitting.value) return
    const trimmedName = createChannelName.value.trim()
    createChannelError.value = ''

    if (!trimmedName) {
        createChannelError.value = 'Kanal adı gerekli'
        return
    }

    const normalized = normalizeChannelName(trimmedName)
    const existing = app.viewedChannels.some(
        ch => normalizeChannelName(ch.name) === normalized
    )
    if (existing) {
        createChannelError.value = 'Bu kanal adı zaten kullanılıyor'
        return
    }

    app.clearCommandError(channelCreateType.value)
    const type =
        createChannelType.value === ChannelType.Voice ? CHANNEL_TYPE_VOICE : CHANNEL_TYPE_TEXT
    createChannelSubmitting.value = true
    createChannelHubId.value = app.viewedHubId
    if (createChannelHubId.value) {
        createChannelInitialCount.value =
            app.channelsByHub[createChannelHubId.value]?.length ?? 0
    }
    await socket.createChannel(app.viewedHubId, trimmedName, type)
}

async function onSaveChannelRename() {
    if (!app.viewedHubId || !selectedChannelId.value) return
    if (!canManage.value) return

    const trimmedName = channelRenameValue.value.trim()
    channelRenameError.value = ''

    if (!trimmedName) {
        channelRenameError.value = 'Kanal adı gerekli'
        return
    }

    const normalized = normalizeChannelName(trimmedName)
    const existing = app.viewedChannels.some(
        ch => ch.id !== selectedChannelId.value && normalizeChannelName(ch.name) === normalized
    )
    if (existing) {
        channelRenameError.value = 'Bu kanal adı zaten kullanılıyor'
        return
    }

    app.clearCommandError(channelRenameType.value)
    await socket.updateChannelSettings(selectedChannelId.value, { name: trimmedName })
    closeChannelSettings()
}

async function onDeleteChannel() {
    if (!app.viewedHubId || !selectedChannelId.value) return
    if (!canDeleteChannel.value) return

    if (!channelDeleteConfirm.value) {
        channelDeleteConfirm.value = true
        return
    }

    channelDeleteError.value = ''
    app.clearCommandError(channelRemoveType.value)
    await socket.removeChannel(selectedChannelId.value)
    closeChannelSettings()
}

async function copyInvite() {
    if (!inviteCode.value) return
    try {
        await navigator.clipboard.writeText(inviteCode.value)
        inviteError.value = 'Kopyalandı'
    } catch {
        inviteError.value = 'Kopyalama başarısız'
    }
}

watch(
    () => hasActiveVoice.value,
    (active) => {
        if (!active) {
            closeVoiceSwitchConfirm()
        }
    }
)

watch(
    () => app.hubJoinCodes[inviteHubId.value ?? ''],
    (code) => {
        if (!inviteOpen.value || !code) return
        inviteCode.value = code
        inviteLoading.value = false
    }
)

watch(
    () => app.commandErrors,
    () => {
        const inviteErr = app.commandErrors[hubInviteType.value]
        if (inviteErr && inviteOpen.value) {
            inviteError.value = inviteErr.message
            inviteLoading.value = false
        }
        const removeErr = app.commandErrors[hubRemoveType.value]
        if (removeErr && settingsOpen.value) {
            renameError.value = removeErr.message
        }
        const updateErr = app.commandErrors[hubUpdateType.value]
        if (updateErr && settingsOpen.value) {
            renameError.value = updateErr.message
        }
        const createErr = app.commandErrors[channelCreateType.value]
        if (createErr && createChannelOpen.value) {
            createChannelError.value = createErr.message
            createChannelSubmitting.value = false
        }
        const renameErr = app.commandErrors[channelRenameType.value]
        if (renameErr && channelSettingsOpen.value) {
            channelRenameError.value = renameErr.message
        }
        const channelRemoveErr = app.commandErrors[channelRemoveType.value]
        if (channelRemoveErr && channelSettingsOpen.value) {
            channelDeleteError.value = channelRemoveErr.message
        }
        const roleUpdateErr = app.commandErrors[hubMemberRoleUpdateType.value]
        if (roleUpdateErr) {
            devWarn('[profile] role update failed', roleUpdateErr.message)
        }
        const hubKickErr = app.commandErrors[hubMemberKickType.value]
        if (hubKickErr) {
            devWarn('[profile] hub kick failed', hubKickErr.message)
        }
        const voiceKickErr = app.commandErrors[voiceKickParticipantType.value]
        if (voiceKickErr) {
            devWarn('[profile] voice kick failed', voiceKickErr.message)
        }
    },
    { deep: true }
)

watch(
    () => app.viewedHub?.name,
    (name) => {
        if (!settingsOpen.value || !name) return
        renameValue.value = name
        deleteConfirm.value = false
    }
)

watch(
    () => app.viewedHub?.avatar_seed,
    (seed) => {
        if (!settingsOpen.value) return
        selectedAvatarSeed.value = seed?.trim() || 'Felix'
    }
)

watch(
    () => createChannelHubId.value
        ? (app.channelsByHub[createChannelHubId.value]?.length ?? 0)
        : 0,
    (count) => {
        if (!createChannelOpen.value || !createChannelSubmitting.value) return
        const createErr = app.commandErrors[channelCreateType.value]
        if (createErr) return
        if (count > createChannelInitialCount.value) {
            createChannelSubmitting.value = false
            closeCreateChannel()
        }
    }
)

watch(
    () => app.lastChannelCreated,
    (event) => {
        if (!event || !createChannelOpen.value || !createChannelSubmitting.value) return
        if (createChannelHubId.value && event.hubId !== createChannelHubId.value) return
        createChannelSubmitting.value = false
        closeCreateChannel()
    }
)

watch(
    () => app.viewedChannels,
    (channels) => {
        if (!channelSettingsOpen.value || !selectedChannelId.value) return
        const channel = channels.find(ch => ch.id === selectedChannelId.value)
        if (!channel) return
        channelRenameValue.value = channel.name
    }
)

onMounted(async () => {
    if (import.meta.client) {
        textSectionCollapsed.value = localStorage.getItem(SECTION_STATE_KEY_TEXT) === '1'
        voiceSectionCollapsed.value = localStorage.getItem(SECTION_STATE_KEY_VOICE) === '1'
    }
    const { EnvelopeType } = protoService
    hubInviteType.value = EnvelopeType.HUB_CREATE_JOIN_CODE as number
    hubRemoveType.value = EnvelopeType.HUB_REMOVE as number
    hubUpdateType.value = EnvelopeType.HUB_UPDATE as number
    hubMemberKickType.value = EnvelopeType.HUB_MEMBER_KICK as number
    hubMemberRoleUpdateType.value = EnvelopeType.HUB_MEMBER_ROLE_UPDATE as number
    voiceKickParticipantType.value = EnvelopeType.VOICE_KICK_PARTICIPANT as number
    channelCreateType.value = EnvelopeType.CHANNEL_CREATE as number
    channelRenameType.value = EnvelopeType.CHANNEL_UPDATE as number
    channelRemoveType.value = EnvelopeType.CHANNEL_REMOVE as number
})

watch(textSectionCollapsed, (collapsed) => {
    if (!import.meta.client) return
    localStorage.setItem(SECTION_STATE_KEY_TEXT, collapsed ? '1' : '0')
})

watch(voiceSectionCollapsed, (collapsed) => {
    if (!import.meta.client) return
    localStorage.setItem(SECTION_STATE_KEY_VOICE, collapsed ? '1' : '0')
})
</script>

<template>
    <div class="channel-col" v-bind="attrs">
        <HubHeader
            v-if="app.viewedHub"
            :mobile-mode="mobileMode"
            @invite-people="openInvite"
            @create-channel="openCreateChannel"
            @hub-settings="openSettings"
            @leave-hub="onLeaveHub"
            @close="emit('close')"
        />
        <!-- Mobile close button fallback when no hub selected -->
        <div class="header" v-else-if="mobileMode">
            <span class="hub-name no-hub-title font-bold truncate" style="color: #94a3b8;">Sunucu seçilmedi</span>
            <button class="mobile-close" @click="emit('close')" aria-label="Kapat">×</button>
        </div>

        <div v-if="showHubLoading" class="channel-loading" aria-live="polite">
            <div class="channel-loading-section">
                <Skeleton width="120px" height="12px" radius="6px" />
                <Skeleton width="100%" height="36px" radius="8px" />
                <Skeleton width="100%" height="36px" radius="8px" />
                <Skeleton width="72%" height="36px" radius="8px" />
            </div>
            <div class="channel-loading-section">
                <Skeleton width="120px" height="12px" radius="6px" />
                <Skeleton width="100%" height="36px" radius="8px" />
                <Skeleton width="85%" height="36px" radius="8px" />
            </div>
        </div>

        <div class="channel-list" v-else-if="app.viewedChannels.length">
            <div class="channel-section">
                <SidebarSectionHeader
                    title="METİN KANALLARI"
                    :collapsed="textSectionCollapsed"
                    :show-add-icon="canManage"
                    add-icon-label="Kanal oluştur"
                    @toggle="toggleTextSection"
                    @create="openCreateChannel"
                />
                <Transition name="section-collapse">
                <div v-show="!textSectionCollapsed" class="channel-section-items">
                    <ChannelItem
                        v-for="ch in textChannels"
                        :key="ch.id"
                        class="channel group"
                        :active="ch.id === app.activeChannelId"
                        :show-settings="canManage"
                        settings-aria-label="Kanal ayarları"
                        @click="openChannel(ch.id)"
                        @settings="onChannelSettings(ch)"
                    >
                        <div class="channel-row-label flex items-center gap-2 flex-1 overflow-hidden">
                            <span class="hash">
                                <IconTextChannel :size="20" />
                            </span>
                            <span class="channel-row-text truncate">{{ ch.name }}</span>
                        </div>
                    </ChannelItem>
                </div>
                </Transition>
            </div>

            <div class="channel-section">
                <SidebarSectionHeader
                    title="SESLİ KANALLAR"
                    :collapsed="voiceSectionCollapsed"
                    :show-add-icon="canManage"
                    add-icon-label="Kanal oluştur"
                    @toggle="toggleVoiceSection"
                    @create="openCreateChannel"
                />
                <Transition name="section-collapse">
                <div v-show="!voiceSectionCollapsed" class="channel-section-items">
                    <div v-for="ch in voiceChannels" :key="ch.id"
                        class="voice-channel-block">
                        <ChannelItem
                            class="channel group"
                            :channel-type="ChannelType.Voice"
                            :channel-name="ch.name"
                            :started-at-unix="voiceStartedAtUnixForChannel(ch.id)"
                            :participants="voiceParticipantsForChannel(ch.id)"
                            :active="hasActiveVoice && ch.id === app.activeVoiceChannelId && app.activeVoiceHubId === app.viewedHubId"
                            :show-settings="canManage"
                            settings-aria-label="Kanal ayarları"
                            @click="openChannel(ch.id)"
                            @settings="onChannelSettings(ch)"
                            @show-profile="onShowVoiceProfile(ch.id, $event)"
                            @show-voice-controls="onShowVoiceControls(ch.id, $event)"
                        />
                    </div>
                </div>
                </Transition>
            </div>
        </div>

        <div class="channel-empty" v-else>
            <EmptyState
                icon="📭"
                :title="emptyStateTitle"
                :message="emptyStateMessage"
                :action-text="emptyStateActionText"
                compact
                @action="openCreateChannel"
            />
        </div>

    </div>

    <ProfileCard
        v-if="activeUserCard && activeUserCard.mode === 'profile'"
        :user-id="activeUserCard.userId"
        :position="{ x: activeUserCard.x, y: activeUserCard.y }"
        :hub-id="app.viewedHubId"
        @close="closeProfile"
        @update-role="onUpdateRole"
        @kick-user="onKickUser"
        @kick-user-from-voice="onKickUserFromVoice"
    />

    <VoiceParticipantCard
        v-if="activeUserCard && activeUserCard.mode === 'voice-controls'"
        :user-id="activeUserCard.userId"
        :position="{ x: activeUserCard.x, y: activeUserCard.y }"
        :hub-id="app.viewedHubId"
        :channel-id="activeUserCard.voiceChannelId ?? null"
        @close="closeProfile"
        @update-role="onUpdateRole"
        @kick-user="onKickUser"
        @kick-user-from-voice="onKickUserFromVoice"
        @set-user-volume="onSetUserVolume"
    />

    <Teleport to="body">
        <div v-if="inviteOpen" class="hub-overlay">
            <div class="hub-surface" @click="closeInvite"></div>
            <div class="hub-card" role="dialog" aria-modal="true">
                <div class="hub-header-row">
                    <div>
                        <div class="hub-title">Sunucu Daveti</div>
                        <div class="hub-sub">Bu bağlantıyı üyelerinle paylaş.</div>
                    </div>
                    <button class="hub-close" @click="closeInvite" aria-label="Kapat">
                        <IconClose :size="14" />
                    </button>
                </div>
                <div class="hub-content">
                    <div class="hub-field">
                        <label class="hub-label">DAVET BAĞLANTISI</label>
                        <div class="hub-code-row">
                            <input class="hub-input" type="text" readonly
                                :value="inviteLoading ? 'Oluşturuluyor...' : inviteCode" />
                            <button class="hub-btn primary" @click="copyInvite" :disabled="inviteLoading || !inviteCode">
                                Kopyala
                            </button>
                        </div>
                    </div>
                    <div v-if="inviteError" class="hub-error">{{ inviteError }}</div>
                </div>
            </div>
        </div>
    </Teleport>

    <HubSettingsModal
        v-model="settingsOpen"
        :hub-name="renameValue"
        :selected-avatar-seed="selectedAvatarSeed"
        :avatar-seeds="avatarSeeds"
        :has-changes="hubHasChanges"
        :can-manage="canSettings"
        :can-delete="canDeleteHub"
        :rename-error="renameError"
        :avatar-error="avatarError"
        :delete-confirm="deleteConfirm"
        @update:hub-name="renameValue = $event"
        @update:selected-avatar-seed="selectedAvatarSeed = $event"
        @save="onSaveHubSettings"
        @delete="onDeleteHub"
    />

    <CreateChannelModal
        v-model="createChannelOpen"
        :channel-type="createChannelType"
        :channel-name="createChannelName"
        :can-create="canSettings"
        :submitting="createChannelSubmitting"
        :error="createChannelError"
        @update:channel-type="createChannelType = $event"
        @update:channel-name="createChannelName = $event"
        @create="onCreateChannel"
    />

    <ChannelSettingsModal
        v-model="channelSettingsOpen"
        :channel-name="channelRenameValue"
        :has-changes="channelHasChanges"
        :can-manage="canManage"
        :can-delete="canDeleteChannel"
        :rename-error="channelRenameError"
        :delete-error="channelDeleteError"
        :delete-confirm="channelDeleteConfirm"
        @update:channel-name="channelRenameValue = $event"
        @save="onSaveChannelRename"
        @delete="onDeleteChannel"
    />

    <Teleport to="body">
        <div v-if="voiceSwitchConfirmOpen" class="hub-overlay">
            <div class="hub-surface" @click="closeVoiceSwitchConfirm"></div>
            <div class="hub-card" role="dialog" aria-modal="true">
                <div class="hub-header-row">
                    <div>
                        <div class="hub-title">Ses kanalını değiştir?</div>
                        <div class="hub-sub">
                            Şu anda <strong>{{ currentVoiceChannelName }}</strong> kanalındasın.
                            Ayrılıp <strong>{{ pendingVoiceSwitch?.channelName }}</strong> kanalına geçmek istiyor musun?
                        </div>
                    </div>
                    <button class="hub-close" @click="closeVoiceSwitchConfirm" aria-label="Kapat">
                        <IconClose :size="14" />
                    </button>
                </div>
                <div class="hub-content">
                    <div class="hub-actions">
                        <button class="hub-btn ghost" @click="closeVoiceSwitchConfirm">Vazgeç</button>
                        <button class="hub-btn primary" @click="confirmVoiceSwitch">Kanala geç</button>
                    </div>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
.channel-col {
    display: flex;
    flex-direction: column;
    flex: 1 1 0;
    min-height: 0;
    overflow: hidden;
}

.mobile-close {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.05);
    color: #f8fafc;
    font-size: 20px;
    display: none;
    place-items: center;
    cursor: pointer;
    transition: all 0.15s ease;
    margin-left: auto;
}

.mobile-close:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.3);
}

@media (max-width: 1023px) {
    .mobile-close {
        display: grid;
    }
}

.header {
    height: 48px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    display: flex;
    align-items: center;
    justify-content: flex-start;
    padding: 0 16px;
    margin-top: 8px;
    margin-bottom: 8px;
    position: relative;
    gap: 8px;
}

.hub-name {
    color: #fff;
    font-size: 14px;
}

.hub-overlay {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: flex;
    align-items: center;
    justify-content: center;
}

.hub-surface {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
}

.hub-card {
    position: relative;
    z-index: 1;
    width: min(448px, 94vw);
    max-height: 90vh;
    overflow-y: auto;
    border-radius: 16px;
    background: #0d1020;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6);
}

.hub-header-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 28px 28px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.hub-close {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    border-radius: 8px;
    color: #4a5568;
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
}

.hub-close:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.05);
}

.hub-content {
    padding: 28px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.hub-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

@media (max-width: 1023px) {
    .hub-header-row {
        padding: 20px 20px 16px;
    }

    .hub-content {
        padding: 20px;
    }

    .hub-actions {
        flex-direction: column;
    }

    .hub-btn {
        width: 100%;
        text-align: center;
    }
}

.hub-title {
    font-family: 'Inter', sans-serif;
    font-weight: 700;
    font-size: 1.15rem;
    color: #fff;
}

.hub-sub {
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    color: #8892a4;
    margin-top: 4px;
}

.hub-label {
    font-family: 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 600;
    color: #8892a4;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.hub-input {
    width: 100%;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 12px 16px;
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    color: #fff;
    outline: none;
    transition: border-color 0.2s;
}

.hub-input::placeholder {
    color: #4a5568;
}

.hub-input:focus {
    border-color: rgba(124, 58, 237, 0.4);
}

.hub-code-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px;
    align-items: center;
}

.hub-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    padding-top: 8px;
}

.hub-btn {
    border: none;
    border-radius: 12px;
    padding: 10px 18px;
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
}

.hub-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.hub-btn.primary {
    color: #fff;
    font-weight: 600;
    background: linear-gradient(135deg, #6d28d9, #7c3aed);
    box-shadow: 0 0 20px rgba(124, 58, 237, 0.35);
}

.hub-btn.primary:hover:not(:disabled) {
    background: linear-gradient(135deg, #7c3aed, #8b5cf6);
}

.hub-btn.ghost {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #8892a4;
}

.hub-btn.ghost:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.04);
}

.hub-error {
    font-family: 'Inter', sans-serif;
    font-size: 12px;
    color: #ef4444;
}

.channel-list {
    padding: 8px;
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.channel {
    padding: 8px 10px;
    cursor: pointer;
    color: #94a3b8;
    border-radius: 8px;
    text-align: left;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    transition: all 0.2s ease;
    margin-bottom: 2px;
}

.voice-channel-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.channel:hover {
    background: rgba(255, 255, 255, 0.03);
    color: #e2e8f0;
    padding-left: 14px;
}

.channel.active {
    background: linear-gradient(90deg, rgba(99, 102, 241, 0.15), transparent);
    border-left: 3px solid #6366f1;
    color: #fff;
    padding-left: 14px;
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateX(-5px);
    }

    to {
        opacity: 1;
        transform: translateX(0);
    }
}

.hash {
    color: #64748b;
    font-size: 16px;
    flex-shrink: 0;
    opacity: 0.7;
}

.active .hash {
    color: #818cf8;
    opacity: 1;
    text-shadow: 0 0 8px rgba(99, 102, 241, 0.4);
}

.channel-col {
    display: flex;
    flex-direction: column;
    flex: 1 1 0;
    min-height: 0;
    overflow: hidden;
    font-family: 'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    background:
        radial-gradient(circle at 0% 0%, rgba(104, 70, 255, 0.14), transparent 40%),
        linear-gradient(180deg, #060a1d, #050919 82%);
}

.header {
    height: 56px;
    padding: 0 16px;
    border-bottom: 1px solid rgba(124, 139, 177, 0.12);
    background: rgba(6, 10, 27, 0.88);
}

.hub-name {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.016em;
}

.channel-list {
    flex: 1;
    min-height: 0;
    padding: 14px 10px 12px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.channel {
    min-height: 40px;
    padding: 9px 12px;
    border-radius: 10px;
    color: rgba(192, 206, 236, 0.82);
    font-size: 14px;
    font-weight: 500;
    line-height: 1.1;
    border: 1px solid transparent;
    margin-bottom: 0;
}

.channel:hover {
    background: rgba(109, 132, 191, 0.1);
    border-color: rgba(109, 132, 191, 0.12);
    color: #eff5ff;
    padding-left: 12px;
}

.channel.active {
    border-left: 0;
    padding-left: 12px;
    background: linear-gradient(90deg, rgba(92, 53, 188, 0.74), rgba(68, 38, 130, 0.24));
    border-color: rgba(146, 126, 255, 0.22);
    box-shadow: inset 3px 0 0 rgba(196, 180, 255, 0.92);
    color: #f8fbff;
}

.hash {
    width: 15px;
    height: 15px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: rgba(131, 153, 202, 0.78);
    opacity: 1;
}

.hash svg {
    width: 15px;
    height: 15px;
}

.channel.active .hash {
    color: #c6b8ff;
    text-shadow: none;
}

.voice-channel-block {
    gap: 5px;
}

.channel-loading {
    flex: 1;
    min-height: 0;
    display: grid;
    gap: 18px;
    padding: 16px 12px 14px;
    overflow: hidden;
}

.channel-loading-section {
    display: grid;
    gap: 8px;
}

.channel-empty {
    flex: 1;
    display: grid;
    place-content: center;
    gap: 4px;
    padding: 24px;
    text-align: center;
}

@media (max-width: 1023px) {
    .header {
        padding-inline: 12px;
    }
}

/* parity overrides */
.channel-col {
    background: #0a0d1c;
    border-right: 0;
}

.header {
    height: 56px;
    margin-bottom: 0;
    padding: 0 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    background: transparent;
}

.hub-name {
    font-size: 0.9rem;
    font-weight: 600;
    color: #ffffff;
}

.channel-list {
    padding: 12px 8px;
    gap: 2px;
}

.channel {
    min-height: 36px;
    border-radius: 8px;
    border: 0;
    background: transparent;
    color: #8892a4;
    font-size: 14px;
    font-weight: 400;
    padding: 8px 12px;
}

.channel:hover {
    background: rgba(255, 255, 255, 0.03);
    color: #8892a4;
}

.channel.active {
    position: relative;
    border: 0;
    box-shadow: none;
    background: rgba(124, 58, 237, 0.18);
    color: #c4b5fd;
    padding-left: 12px;
}

.channel.active::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 2px;
    height: 20px;
    border-radius: 0 999px 999px 0;
    background: #a78bfa;
}

.hash {
    color: #4a5568;
}

.channel.active .hash {
    color: #a78bfa;
}

.channel-empty {
    padding: 18px 14px;
}

/* Sidebar section header parity (final override) */
.channel-list {
    padding: 12px 8px;
    gap: 2px;
}

.channel-section {
    display: flex;
    flex-direction: column;
}

.channel-section + .channel-section {
    margin-top: 16px;
}

.channel-section-items {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
}

.section-collapse-enter-active,
.section-collapse-leave-active {
    transition: max-height 0.22s ease, opacity 0.2s ease;
}

.section-collapse-enter-from,
.section-collapse-leave-to {
    max-height: 0;
    opacity: 0;
}

.section-collapse-enter-to,
.section-collapse-leave-from {
    max-height: 960px;
    opacity: 1;
}

/* Layout invariance contract */
.header {
    height: var(--ui-sidebar-header-h, 56px);
    min-height: var(--ui-sidebar-header-h, 56px);
}

.channel-list {
    min-width: 0;
    overflow-x: hidden;
}

.no-hub-title {
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.channel-row-label,
.channel-row-text {
    min-width: 0;
}

.channel-row-text {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.voice-channel-block,
.channel-section-items {
    min-width: 0;
}

.channel {
    min-width: 0;
    padding: 0;
    margin: 0;
    border: 0;
    box-sizing: border-box;
}

.channel:hover,
.channel.active {
    padding: 0;
}

.channel :deep(.ui-channel-item) {
    min-width: 0;
    min-height: var(--ui-channel-row-h, 36px);
    height: var(--ui-channel-row-h, 36px);
    max-height: var(--ui-channel-row-h, 36px);
}

.channel :deep(.ui-channel-item-content),
.channel :deep(.ui-channel-name),
.channel :deep(.ui-channel-item-meta) {
    min-width: 0;
}

.channel :deep(.ui-channel-name) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
