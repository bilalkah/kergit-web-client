<script setup lang="ts">
import VoiceParticipant from '~/components/ui/VoiceParticipant.vue'
import Tooltip from '~/components/ui/Tooltip.vue'
import { ChannelType } from '~/stores/app'
import { IconTextChannel, IconVoiceChannel } from '~/components/icons/Common'
defineOptions({ inheritAttrs: false })

interface VoiceParticipantView {
  userId: string
  displayName: string
  role?: string
  avatarSeed?: string
  speaking?: boolean
  muted?: boolean
  deafened?: boolean
}

const props = withDefaults(
  defineProps<{
    active?: boolean
    showSettings?: boolean
    settingsAriaLabel?: string
    channelType?: ChannelType
    channelName?: string
    startedAtUnix?: number
    participants?: VoiceParticipantView[]
  }>(),
  {
    active: false,
    showSettings: false,
    settingsAriaLabel: 'Kanal ayarları',
    channelType: ChannelType.Text,
    channelName: '',
    startedAtUnix: 0,
    participants: () => [],
  }
)

const emit = defineEmits<{
  click: []
  settings: []
  'show-profile': [{ userId: string; x: number; y: number }]
  'show-voice-controls': [{ userId: string; x: number; y: number }]
}>()
const attrs = useAttrs()

const hasParticipants = computed(() =>
  props.channelType === ChannelType.Voice && props.participants.length > 0
)

const nowMs = ref(Date.now())
let timerInterval: ReturnType<typeof setInterval> | null = null

function startTimer() {
  if (timerInterval) return
  timerInterval = setInterval(() => {
    nowMs.value = Date.now()
  }, 1000)
}

function stopTimer() {
  if (!timerInterval) return
  clearInterval(timerInterval)
  timerInterval = null
}

watch(hasParticipants, (active) => {
  if (active && props.startedAtUnix > 0) {
    startTimer()
    return
  }

  stopTimer()
}, { immediate: true })

watch(() => props.startedAtUnix, (startedAtUnix) => {
  if (hasParticipants.value && startedAtUnix > 0) {
    startTimer()
    return
  }
  stopTimer()
})

onBeforeUnmount(() => {
  stopTimer()
})

const formattedTimer = computed(() => {
  if (!hasParticipants.value || props.startedAtUnix <= 0) return ''
  const startedAtMs = props.startedAtUnix * 1000
  const elapsedSec = Math.max(0, Math.floor((nowMs.value - startedAtMs) / 1000))
  const hours = Math.floor(elapsedSec / 3600)
  const minutes = Math.floor((elapsedSec % 3600) / 60)
  const seconds = elapsedSec % 60
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})

function onSettingsClick() {
  if (!props.showSettings) return
  emit('settings')
}
</script>

<template>
  <div class="ui-channel-item-wrap">
    <button
      v-bind="attrs"
      class="ui-channel-item"
      :class="{ active: props.active }"
      type="button"
      @click="emit('click')"
    >
      <span class="ui-channel-item-content">
        <slot>
          <span class="ui-channel-icon" :class="{ voice: props.channelType === ChannelType.Voice }" aria-hidden="true">
            <IconVoiceChannel v-if="props.channelType === ChannelType.Voice" :size="20" />
            <IconTextChannel v-else :size="20" />
          </span>
          <span class="ui-channel-name truncate">{{ props.channelName }}</span>
        </slot>
      </span>
      <span class="ui-channel-item-meta">
        <Tooltip v-if="hasParticipants" :content="formattedTimer">
          <span class="ui-voice-timer">{{ formattedTimer }}</span>
        </Tooltip>
        <slot name="meta" />
      </span>
      <span class="channel-actions" :class="{ 'is-placeholder': !props.showSettings }" @click.stop>
        <button
          class="channel-settings"
          type="button"
          :aria-label="props.showSettings ? props.settingsAriaLabel : undefined"
          :aria-hidden="props.showSettings ? 'false' : 'true'"
          :disabled="!props.showSettings"
          :tabindex="props.showSettings ? 0 : -1"
          @click.stop="onSettingsClick"
        >
          <span class="settings-dots">...</span>
        </button>
      </span>
    </button>

    <div v-if="hasParticipants" class="ui-voice-participants">
      <VoiceParticipant
        v-for="participant in props.participants"
        :key="participant.userId"
        :participant="participant"
        @show-profile="emit('show-profile', $event)"
        @show-voice-controls="emit('show-voice-controls', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.ui-channel-item-wrap {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  width: 100%;
  min-width: 0;
}

.ui-channel-item {
  width: 100%;
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #8892a4;
  text-align: left;
  padding: 8px 10px;
}

.ui-channel-item-content {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.ui-channel-item-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.ui-channel-item.active {
  background: rgba(124, 58, 237, 0.18);
  color: #c4b5fd;
}

.ui-channel-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: #4a5568;
}

.ui-channel-icon svg {
  width: 16px;
  height: 16px;
}

.ui-channel-item.active .ui-channel-icon {
  color: #a78bfa;
}

.ui-channel-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-voice-timer {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: rgba(142, 164, 214, 0.82);
}

.ui-voice-participants {
  margin: 2px 0 6px 20px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.channel-actions {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 20px;
  width: 20px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease;
}

.ui-channel-item:hover .channel-actions,
.ui-channel-item:focus-within .channel-actions {
  opacity: 1;
  pointer-events: auto;
}

.channel-actions.is-placeholder,
.ui-channel-item:hover .channel-actions.is-placeholder,
.ui-channel-item:focus-within .channel-actions.is-placeholder {
  opacity: 0;
  pointer-events: none;
}

.channel-settings {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
  color: #94a3b8;
  transition: color 0.15s ease, background 0.15s ease;
}

.channel-settings:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

.settings-dots {
  font-weight: 700;
  font-size: 18px;
  line-height: 0.5;
  margin-bottom: 8px;
  display: block;
  color: currentColor;
}
</style>
