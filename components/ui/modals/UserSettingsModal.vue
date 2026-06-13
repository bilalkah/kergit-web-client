<script setup lang="ts">
import {
  DEFAULT_VOICE_DEVICE_ID,
  coercePreferredVoiceDeviceId,
  getPreferredVoiceDeviceId,
  listVoiceAudioDevices,
  supportsSpeakerSelection,
  listVideoDevices,
  getPreferredCameraDeviceId,
  coercePreferredCameraDeviceId,
  getCameraQualityPreset,
  setCameraQualityPreset,
  getScreenShareQualityPreset,
  setScreenShareQualityPreset,
  type VideoQualityPreset,
} from '@/src/services/webrtc/devices'
import {
  applyVoiceProcessingSettings,
  setInputSensitivitySettings,
  setPreferredMicrophoneDevice,
  setPreferredSpeakerDevice,
  setSpeakerLevel,
  subscribeVoiceInputMeter,
  setPreferredCamera,
  applyCameraQualityPreset,
  applyScreenShareQualityPreset,
} from '@/src/services/webrtc/livekit'
import type { VoiceInputMeterState } from '@/src/services/webrtc/inputHandler'
import {
  normalizeInputSensitivityThreshold,
  normalizeVoiceLevelPercent,
  readStoredVoiceLevel,
  writeStoredVoiceLevel,
} from '@/src/services/webrtc/utils'
import { updateCurrentEmail, updateCurrentPassword } from '@/src/services/auth/http'
import { getPasswordValidationError } from '@/src/utils/password'
import { userAvatarUrl } from '@/src/utils/avatar'
import { devError, devWarn } from '@/src/utils/safeLogger'
import { protoService } from '@/src/services/proto'
import Modal from '../Modal.vue'
import Avatar from '../Avatar.vue'
import ChangeUsernameModal from './ChangeUsernameModal.vue'
import ChangeEmailModal from './ChangeEmailModal.vue'
import ChangePasswordModal from './ChangePasswordModal.vue'
import DeleteAccountModal from './DeleteAccountModal.vue'
import { InputSensitivityMode, NoiseCancellationMethod } from '@/src/services/webrtc/inputHandler'
import { useAppStore, VideoMode } from '~/stores/app'
import { useAuthStore } from '~/stores/auth'
import { useToast } from '~/composables/useToast'
import { useWebSocket } from '~/composables/useWebSocket'

enum SettingsTab {
    Profile = 'profile',
    Voice = 'voice',
    Video = 'video',
    Account = 'account',
}
type VoiceProcessingSettingKey = 'noiseSuppression' | 'echoCancellation'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
}>()

const app = useAppStore()
const auth = useAuthStore()
const router = useRouter()
const toast = useToast()
const socket = useWebSocket()

const userUpdateType = ref(protoService.EnvelopeType.USER_UPDATE as number)
const tab = ref<SettingsTab>(SettingsTab.Profile)

const usernameValue = ref('')
const usernameError = ref('')
const avatarError = ref('')
const formError = ref('')
const selectedAvatarSeed = ref('Caleb')

const microphoneDevices = ref<MediaDeviceInfo[]>([])
const speakerDevices = ref<MediaDeviceInfo[]>([])
const selectedMicrophoneDeviceId = ref(DEFAULT_VOICE_DEVICE_ID)
const selectedSpeakerDeviceId = ref(DEFAULT_VOICE_DEVICE_ID)
const deviceError = ref('')
const deviceSuccess = ref('')
const devicesLoading = ref(false)
const deviceUpdateKind = ref<'audioinput' | 'audiooutput' | null>(null)
const speakerSelectionAvailable = ref(false)

const cameraDevices = ref<MediaDeviceInfo[]>([])
const selectedCameraDeviceId = ref(DEFAULT_VOICE_DEVICE_ID)
const selectedCameraQuality = ref<VideoQualityPreset>(getCameraQualityPreset())
const selectedScreenShareQuality = ref<VideoQualityPreset>(getScreenShareQualityPreset())
const selectedVideoMode = ref<VideoMode>(app.videoMode)
const videoDevicesLoading = ref(false)
const videoError = ref('')
const videoSuccess = ref('')

const speakerLevel = ref(100)
const inputSensitivityThreshold = ref(42)
const micInputLevel = ref(0)
const effectiveInputThreshold = ref(42)
let stopVoiceInputMeter: (() => void) | null = null

const changeUsernameOpen = ref(false)
const changeEmailOpen = ref(false)
const changePasswordOpen = ref(false)
const deleteAccountOpen = ref(false)

const emailError = ref('')
const emailLoading = ref(false)
const passwordError = ref('')
const passwordLoading = ref(false)
const deleteAccountError = ref('')
const deleteAccountLoading = ref(false)

const avatarSeeds = [
  'Caleb',
  'Avery',
  'Milo',
  'Nova',
  'Luna',
  'Zara',
  'Rex',
  'Atlas',
  'Ivy',
  'Kai',
  'Maya',
  'Jude',
]

const currentUsername = computed(() =>
  (app.username ?? '').trim()
)

const currentAvatarSeed = computed(() =>
  app.avatarSeed?.trim() || 'Caleb'
)

const currentEmail = computed(() =>
  (auth.user?.email ?? '').trim()
)

const currentEmailLabel = computed(() =>
  currentEmail.value || 'Bilinmiyor'
)

const pendingEmail = computed(() =>
  (auth.user?.new_email ?? '').trim()
)

const pendingEmailNotice = computed(() =>
  pendingEmail.value
    ? 'Değişikliği tamamlamak için eski ve yeni e-posta adreslerine gönderilen doğrulama bağlantılarını onayla.'
    : ''
)

const userHasChanges = computed(() => {
  const trimmedName = usernameValue.value.trim()
  const trimmedAvatar = selectedAvatarSeed.value.trim()
  return trimmedName !== currentUsername.value || trimmedAvatar !== currentAvatarSeed.value
})

const speakerLevelLabel = computed(() => `${speakerLevel.value}%`)
const inputSensitivityThresholdLabel = computed(() => `${inputSensitivityThreshold.value}%`)
const micInputLevelLabel = computed(() => `${micInputLevel.value}%`)
const inputSensitivityAuto = computed(() =>
  app.voiceProcessingSettings.inputSensitivityMode !== InputSensitivityMode.Manual
)
const sensitivityMeterStyle = computed(() => ({
  '--noise-level': `${micInputLevel.value}%`,
  '--threshold-level': `${(inputSensitivityAuto.value ? effectiveInputThreshold.value : inputSensitivityThreshold.value)}%`,
}))

const closeMain = () => {
  emit('update:modelValue', false)
}

function resetProfileFeedback() {
  usernameError.value = ''
  avatarError.value = ''
  formError.value = ''
}

function resetVoiceFeedback() {
  deviceError.value = ''
  deviceSuccess.value = ''
  deviceUpdateKind.value = null
}

function resetVideoFeedback() {
  videoError.value = ''
  videoSuccess.value = ''
}

function resetAccountFeedback() {
  emailError.value = ''
  passwordError.value = ''
  deleteAccountError.value = ''
}

function applyInputSensitivityRuntime() {
  const mode = app.voiceProcessingSettings.inputSensitivityMode === InputSensitivityMode.Manual ? InputSensitivityMode.Manual : InputSensitivityMode.Auto
  const threshold = normalizeInputSensitivityThreshold(app.voiceProcessingSettings.inputSensitivityThreshold)
  setInputSensitivitySettings(mode, threshold)
}

function startVoiceInputMeter() {
  if (stopVoiceInputMeter) return
  stopVoiceInputMeter = subscribeVoiceInputMeter((state: VoiceInputMeterState) => {
    micInputLevel.value = normalizeInputSensitivityThreshold(state.levelPercent)
    effectiveInputThreshold.value = normalizeInputSensitivityThreshold(state.thresholdPercent)
  })
}

function stopVoiceInputMeterSubscription() {
  if (!stopVoiceInputMeter) return
  stopVoiceInputMeter()
  stopVoiceInputMeter = null
}

function formatAudioDeviceLabel(device: MediaDeviceInfo, kind: 'audioinput' | 'audiooutput', index: number): string {
  const label = device.label?.trim()
  if (label) return label
  return kind === 'audioinput' ? `Mikrofon ${index + 1}` : `Hoparlör ${index + 1}`
}

function sortVoiceDevices(devices: MediaDeviceInfo[]): MediaDeviceInfo[] {
  return [...devices].sort((left, right) => {
    if (left.deviceId === DEFAULT_VOICE_DEVICE_ID && right.deviceId !== DEFAULT_VOICE_DEVICE_ID) return -1
    if (right.deviceId === DEFAULT_VOICE_DEVICE_ID && left.deviceId !== DEFAULT_VOICE_DEVICE_ID) return 1
    return left.label.localeCompare(right.label)
  })
}

async function loadVoiceDevices(requestPermissions = true) {
  if (!import.meta.client) return

  devicesLoading.value = true
  deviceError.value = ''

  try {
    const { audioInputs, audioOutputs } = await listVoiceAudioDevices(requestPermissions)
    microphoneDevices.value = sortVoiceDevices(audioInputs)
    speakerDevices.value = sortVoiceDevices(audioOutputs)
    selectedMicrophoneDeviceId.value = coercePreferredVoiceDeviceId('audioinput', audioInputs)
    selectedSpeakerDeviceId.value = coercePreferredVoiceDeviceId('audiooutput', audioOutputs)
  } catch (error: unknown) {
    deviceError.value = error instanceof Error ? error.message : 'Ses aygıtları yüklenemedi'
  } finally {
    devicesLoading.value = false
  }
}

async function onMicrophoneDeviceChange() {
  const previousDeviceId = getPreferredVoiceDeviceId('audioinput')
  const nextDeviceId = selectedMicrophoneDeviceId.value || DEFAULT_VOICE_DEVICE_ID

  resetVoiceFeedback()
  deviceUpdateKind.value = 'audioinput'

  try {
    const appliedImmediately = await setPreferredMicrophoneDevice(nextDeviceId)
    deviceSuccess.value = appliedImmediately
      ? 'Mikrofon bu ses oturumu için güncellendi'
      : 'Mikrofon tercihi sonraki ses oturumu için kaydedildi'
  } catch (error: unknown) {
    selectedMicrophoneDeviceId.value = previousDeviceId
    deviceError.value = error instanceof Error ? error.message : 'Mikrofon güncellenemedi'
  } finally {
    deviceUpdateKind.value = null
  }
}

async function onSpeakerDeviceChange() {
  const previousDeviceId = getPreferredVoiceDeviceId('audiooutput')
  const nextDeviceId = selectedSpeakerDeviceId.value || DEFAULT_VOICE_DEVICE_ID

  resetVoiceFeedback()
  deviceUpdateKind.value = 'audiooutput'

  try {
    const appliedImmediately = await setPreferredSpeakerDevice(nextDeviceId)
    deviceSuccess.value = appliedImmediately
      ? 'Hoparlör bu ses oturumu için güncellendi'
      : 'Hoparlör tercihi sonraki ses oturumu için kaydedildi'
  } catch (error: unknown) {
    selectedSpeakerDeviceId.value = previousDeviceId
    deviceError.value = error instanceof Error ? error.message : 'Hoparlör güncellenemedi'
  } finally {
    deviceUpdateKind.value = null
  }
}

async function loadVideoDevices(requestPermissions = true) {
  if (!import.meta.client) return
  videoDevicesLoading.value = true
  videoError.value = ''
  try {
    const devices = await listVideoDevices(requestPermissions)
    cameraDevices.value = sortVoiceDevices(devices)
    selectedCameraDeviceId.value = coercePreferredCameraDeviceId(devices)
  } catch (error: unknown) {
    videoError.value = error instanceof Error ? error.message : 'Kamera aygıtları yüklenemedi'
  } finally {
    videoDevicesLoading.value = false
  }
}

function formatVideoDeviceLabel(device: MediaDeviceInfo, index: number): string {
  const label = device.label?.trim()
  return label || `Kamera ${index + 1}`
}

async function onCameraDeviceChange() {
  const nextDeviceId = selectedCameraDeviceId.value || DEFAULT_VOICE_DEVICE_ID
  resetVideoFeedback()
  try {
    const appliedImmediately = await setPreferredCamera(nextDeviceId)
    videoSuccess.value = appliedImmediately
      ? 'Kamera bu oturum için güncellendi'
      : 'Kamera tercihi sonraki oturum için kaydedildi'
  } catch (error: unknown) {
    selectedCameraDeviceId.value = getPreferredCameraDeviceId()
    videoError.value = error instanceof Error ? error.message : 'Kamera güncellenemedi'
  }
}

async function onCameraQualityChange(event: Event) {
  const target = event.target as HTMLSelectElement | null
  const value = target?.value as VideoQualityPreset
  if (!['720p30', '720p60', '1080p30', '1080p60', '1440p30'].includes(value)) return
  selectedCameraQuality.value = value
  setCameraQualityPreset(value)
  resetVideoFeedback()
  try {
    const appliedImmediately = await applyCameraQualityPreset()
    videoSuccess.value = appliedImmediately
      ? 'Kamera kalitesi bu oturum için güncellendi'
      : 'Kamera kalitesi sonraki oturum için kaydedildi'
  } catch (error: unknown) {
    videoError.value = error instanceof Error ? error.message : 'Kamera kalitesi güncellenemedi'
  }
}

async function onScreenShareQualityChange(event: Event) {
  const target = event.target as HTMLSelectElement | null
  const value = target?.value as VideoQualityPreset
  if (!['720p30', '720p60', '1080p30', '1080p60', '1440p30'].includes(value)) return
  selectedScreenShareQuality.value = value
  setScreenShareQualityPreset(value)
  resetVideoFeedback()
  try {
    const appliedImmediately = await applyScreenShareQualityPreset()
    videoSuccess.value = appliedImmediately
      ? 'Ekran paylaşım kalitesi bu oturum için güncellendi'
      : 'Ekran paylaşım kalitesi sonraki oturum için kaydedildi'
  } catch (error: unknown) {
    videoError.value = error instanceof Error ? error.message : 'Ekran paylaşım kalitesi güncellenemedi'
  }
}

async function onVideoModeChange(event: Event) {
  const target = event.target as HTMLSelectElement | null
  const nextMode: VideoMode = target?.value === VideoMode.Quality
    ? VideoMode.Quality
    : VideoMode.Performance
  selectedVideoMode.value = nextMode
  app.setVideoMode(nextMode)

  const defaultCameraPreset: VideoQualityPreset = nextMode === VideoMode.Quality ? '1080p30' : '720p30'
  const defaultScreenPreset: VideoQualityPreset = nextMode === VideoMode.Quality ? '1080p30' : '720p60'

  selectedCameraQuality.value = defaultCameraPreset
  selectedScreenShareQuality.value = defaultScreenPreset
  setCameraQualityPreset(defaultCameraPreset)
  setScreenShareQualityPreset(defaultScreenPreset)

  resetVideoFeedback()
  try {
    const cameraApplied = await applyCameraQualityPreset()
    const screenApplied = await applyScreenShareQualityPreset()
    if (cameraApplied || screenApplied) {
      videoSuccess.value = 'Video modu bu oturum için uygulandı'
    } else {
      videoSuccess.value = 'Video modu sonraki oturumlar için kaydedildi'
    }
  } catch (error: unknown) {
    videoError.value = error instanceof Error ? error.message : 'Video modu güncellenemedi'
  }
}

async function onVoiceProcessingSettingChange(key: VoiceProcessingSettingKey, event: Event) {
  const target = event.target as HTMLInputElement | null
  app.setVoiceProcessingSetting(key, target?.checked === true)

  resetVoiceFeedback()
  try {
    const appliedImmediately = await applyVoiceProcessingSettings()
    deviceSuccess.value = appliedImmediately
      ? 'Ses işleme ayarları bu ses oturumu için güncellendi'
      : 'Ses işleme tercihi sonraki ses oturumu için kaydedildi'
  } catch (error: unknown) {
    deviceError.value = error instanceof Error ? error.message : 'Ses işleme ayarı güncellenemedi'
    devWarn('[settings] failed to apply voice processing settings', error)
  }
}

async function onNoiseCancellationMethodChange(event: Event) {
  const target = event.target as HTMLSelectElement | null
  const method = target?.value === NoiseCancellationMethod.Krisp ? NoiseCancellationMethod.Krisp : NoiseCancellationMethod.WebRTC
  app.setNoiseCancellationMethod(method)

  resetVoiceFeedback()
  try {
    const appliedImmediately = await applyVoiceProcessingSettings()
    deviceSuccess.value = appliedImmediately
      ? 'Gürültü bastırma yöntemi bu ses oturumu için güncellendi'
      : 'Gürültü bastırma yöntemi sonraki ses oturumu için kaydedildi'
  } catch (error: unknown) {
    deviceError.value = error instanceof Error ? error.message : 'Gürültü bastırma yöntemi güncellenemedi'
    devWarn('[settings] failed to apply noise cancellation method', error)
  }
}

function onInputSensitivityModeChange(event: Event) {
  const target = event.target as HTMLInputElement | null
  const nextMode = target?.checked === true ? InputSensitivityMode.Auto : InputSensitivityMode.Manual
  resetVoiceFeedback()
  app.setVoiceInputSensitivityMode(nextMode)
  inputSensitivityThreshold.value = normalizeInputSensitivityThreshold(app.voiceProcessingSettings.inputSensitivityThreshold)
  applyInputSensitivityRuntime()
  deviceSuccess.value = 'Giriş hassasiyeti güncellendi'
}

function initializeModal() {
  tab.value = SettingsTab.Profile
  usernameValue.value = app.username ?? ''
  selectedAvatarSeed.value = app.avatarSeed?.trim() || 'Caleb'
  speakerSelectionAvailable.value = supportsSpeakerSelection()
  selectedMicrophoneDeviceId.value = getPreferredVoiceDeviceId('audioinput')
  selectedSpeakerDeviceId.value = getPreferredVoiceDeviceId('audiooutput')
  speakerLevel.value = readStoredVoiceLevel('kergit:voice:speaker-level', 100)
  inputSensitivityThreshold.value = normalizeInputSensitivityThreshold(app.voiceProcessingSettings.inputSensitivityThreshold)
  effectiveInputThreshold.value = inputSensitivityThreshold.value

  selectedCameraDeviceId.value = getPreferredCameraDeviceId()
  selectedCameraQuality.value = getCameraQualityPreset()
  selectedScreenShareQuality.value = getScreenShareQualityPreset()
  selectedVideoMode.value = app.videoMode

  resetProfileFeedback()
  resetVoiceFeedback()
  resetVideoFeedback()
  resetAccountFeedback()

  passwordLoading.value = false
  emailLoading.value = false
  deleteAccountLoading.value = false

  app.clearCommandError(userUpdateType.value)
  void loadVoiceDevices(true)
  void loadVideoDevices(true)
  applyInputSensitivityRuntime()
  void auth.checkAndHandleFreshSession(router, { redirectUnauthenticated: true })
}

async function onSaveProfile() {
  const trimmedName = usernameValue.value.trim()
  const trimmedAvatar = selectedAvatarSeed.value.trim()
  const currentName = currentUsername.value
  const currentAvatar = currentAvatarSeed.value

  const opts: { username?: string; avatar_seed?: string } = {}
  resetProfileFeedback()

  if (trimmedName !== currentName) {
    if (!trimmedName) {
      usernameError.value = 'Kullanıcı adı gerekli'
      return
    }
    opts.username = trimmedName
  }

  if (trimmedAvatar !== currentAvatar) {
    if (!trimmedAvatar) {
      avatarError.value = 'Bir avatar seç'
      return
    }
    opts.avatar_seed = trimmedAvatar
  }

  if (!opts.username && !opts.avatar_seed) return

  app.clearCommandError(userUpdateType.value)
  await socket.updateUserSettings(opts)
}

function openChangeUsername() {
  changeUsernameOpen.value = true
}

function openChangeEmail() {
  emailError.value = ''
  changeEmailOpen.value = true
}

function openChangePassword() {
  passwordError.value = ''
  changePasswordOpen.value = true
}

function openDeleteAccount() {
  deleteAccountOpen.value = true
}

async function onSubmitChangedUsername(nextUsername: string) {
  usernameValue.value = nextUsername
  changeUsernameOpen.value = false
  app.clearCommandError(userUpdateType.value)
  await socket.updateUserSettings({ username: nextUsername })
}

async function onSubmitChangedEmail(nextEmail: string) {
  emailError.value = ''
  emailLoading.value = true

  try {
    const response = await updateCurrentEmail({
      email: nextEmail,
    })
    auth.setUser(response.user)
    if (response.user.new_email) {
      await auth.checkAndHandleFreshSession(router, { redirectUnauthenticated: true })
    }
    changeEmailOpen.value = false
    toast.show('Doğrulama e-postaları gönderildi.', 'success')
  } catch (error: unknown) {
    devError('[settings] email update failed')
    emailError.value = error instanceof Error ? error.message : 'E-posta güncelleme isteği tamamlanamadı'
  } finally {
    emailLoading.value = false
  }
}

async function onSubmitChangedPassword(payload: { password: string; confirmPassword: string }) {
  passwordError.value = ''

  if (payload.password !== payload.confirmPassword) {
    passwordError.value = 'Şifreler eşleşmiyor'
    return
  }

  const validationError = getPasswordValidationError(payload.password)
  if (validationError) {
    passwordError.value = validationError
    return
  }

  passwordLoading.value = true
  try {
    await updateCurrentPassword({ password: payload.password })
    changePasswordOpen.value = false
    toast.show('Şifre başarıyla güncellendi.', 'success')
  } catch (error: unknown) {
    devError('[settings] password update failed', error)
    passwordError.value = error instanceof Error ? error.message : 'Şifre güncellenemedi'
  } finally {
    passwordLoading.value = false
  }
}

function onConfirmDeleteAccount() {
  deleteAccountLoading.value = false
  deleteAccountError.value = 'Hesap silme işlemi henüz aktif değil'
  devWarn('[settings] delete account is not wired yet')
}

function onBrowserDeviceChange() {
  if (!props.modelValue) return
  void loadVoiceDevices(false)
  void loadVideoDevices(false)
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      initializeModal()
      startVoiceInputMeter()
      return
    }
    stopVoiceInputMeterSubscription()
    changeUsernameOpen.value = false
    changeEmailOpen.value = false
    changePasswordOpen.value = false
    deleteAccountOpen.value = false
  },
  { immediate: true }
)

watch(speakerLevel, (nextSpeaker) => {
  const normalizedSpeaker = normalizeVoiceLevelPercent(nextSpeaker)
  if (normalizedSpeaker !== nextSpeaker) {
    speakerLevel.value = normalizedSpeaker
  }
  writeStoredVoiceLevel('kergit:voice:speaker-level', normalizedSpeaker)
  setSpeakerLevel(normalizedSpeaker)
})

watch(inputSensitivityThreshold, (nextValue) => {
  const normalized = normalizeInputSensitivityThreshold(nextValue)
  if (normalized !== nextValue) {
    inputSensitivityThreshold.value = normalized
    return
  }
  if (app.voiceProcessingSettings.inputSensitivityThreshold !== normalized) {
    app.setVoiceInputSensitivityThreshold(normalized)
  }
  applyInputSensitivityRuntime()
})

watch(
  () => app.voiceProcessingSettings.inputSensitivityThreshold,
  (next) => {
    const normalized = normalizeInputSensitivityThreshold(next)
    if (inputSensitivityThreshold.value !== normalized) {
      inputSensitivityThreshold.value = normalized
    }
  }
)

watch(
  () => app.voiceProcessingSettings.inputSensitivityMode,
  () => {
    applyInputSensitivityRuntime()
  }
)

watch(
  () => app.commandErrors,
  () => {
    const updateErr = app.commandErrors[userUpdateType.value]
    if (updateErr && props.modelValue) {
      formError.value = updateErr.message
    }
  },
  { deep: true }
)

watch(
  () => app.username,
  (next) => {
    if (!props.modelValue || !next) return
    usernameValue.value = next
  }
)

watch(
  () => app.avatarSeed,
  (seed) => {
    if (!props.modelValue) return
    selectedAvatarSeed.value = seed?.trim() || 'Caleb'
  }
)

onMounted(() => {
  if (!import.meta.client) return
  if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', onBrowserDeviceChange)
  }
})

onBeforeUnmount(() => {
  if (!import.meta.client) return
  stopVoiceInputMeterSubscription()
  if (navigator.mediaDevices?.removeEventListener) {
    navigator.mediaDevices.removeEventListener('devicechange', onBrowserDeviceChange)
  }
})
</script>

<template>
  <Modal
    :model-value="props.modelValue"
    title="Kullanıcı Ayarları"
    :dismissible="!emailLoading"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="settings-tabs">
      <button class="settings-tab" :class="{ active: tab === SettingsTab.Profile }" @click="tab = SettingsTab.Profile">Profil</button>
      <button class="settings-tab" :class="{ active: tab === SettingsTab.Voice }" @click="tab = SettingsTab.Voice">Ses</button>
      <button class="settings-tab" :class="{ active: tab === SettingsTab.Video }" @click="tab = SettingsTab.Video">Video</button>
      <button class="settings-tab" :class="{ active: tab === SettingsTab.Account }" @click="tab = SettingsTab.Account">Hesap</button>
    </div>

    <div class="settings-body">
      <template v-if="tab === SettingsTab.Profile">
        <div class="field">
          <label class="label" for="profile-display-name">GÖRÜNEN AD</label>
          <input id="profile-display-name" v-model="usernameValue" class="input" type="text" />
        </div>
        <div v-if="usernameError" class="error">{{ usernameError }}</div>

        <div class="field">
          <label class="label">AVATAR</label>
          <div class="avatar-preview">
            <Avatar :src="userAvatarUrl(selectedAvatarSeed)" alt="Seçilen avatar" :size="42" />
          </div>
          <div class="avatar-grid">
            <button
              v-for="seed in avatarSeeds"
              :key="seed"
              class="avatar-option"
              :class="{ selected: seed === selectedAvatarSeed }"
              type="button"
              @click="selectedAvatarSeed = seed"
            >
              <img :src="userAvatarUrl(seed)" :alt="seed" />
            </button>
          </div>
        </div>
        <div v-if="avatarError" class="error">{{ avatarError }}</div>
        <div v-if="formError" class="error">{{ formError }}</div>

        <div class="actions">
          <button class="btn primary" type="button" :disabled="!userHasChanges" @click="onSaveProfile">Kaydet</button>
        </div>
      </template>

      <template v-if="tab === SettingsTab.Voice">
        <div class="field">
          <label class="label" for="voice-microphone">MİKROFON</label>
          <select
            id="voice-microphone"
            v-model="selectedMicrophoneDeviceId"
            class="input select"
            :disabled="devicesLoading || deviceUpdateKind === 'audioinput'"
            @change="onMicrophoneDeviceChange"
          >
            <option v-for="(device, index) in microphoneDevices" :key="`mic-${device.deviceId}`" :value="device.deviceId">
              {{ formatAudioDeviceLabel(device, 'audioinput', index) }}
            </option>
          </select>
        </div>

        <div class="field">
          <label class="label">SES İŞLEME</label>
          <!-- Removed noise suppression and echo cancellation toggles: always enabled by default -->

          <div class="nc-method-row">
            <label class="label-small" for="voice-nc-method">Gürültü bastırma yöntemi</label>
            <select
              id="voice-nc-method"
              class="input select nc-method-select"
              :value="app.voiceProcessingSettings.noiseCancellationMethod"
              @change="onNoiseCancellationMethodChange"
            >
              <option value="webrtc">WebRTC (Tarayıcı)</option>
              <option value="krisp">Krisp (Gelişmiş AI)</option>
            </select>
          </div>

          <label class="check-row" for="voice-input-sensitivity-auto">
            <input
              id="voice-input-sensitivity-auto"
              type="checkbox"
              :checked="inputSensitivityAuto"
              @change="onInputSensitivityModeChange"
            />
            <span>Giriş hassasiyetini otomatik belirle</span>
          </label>

          <div class="sensitivity-card">
            <div class="sensitivity-meter" :class="{ manual: !inputSensitivityAuto }" :style="sensitivityMeterStyle">
              <div class="sensitivity-meter-track" />
              <div class="sensitivity-meter-live" />
              <div class="sensitivity-meter-threshold" />
              <input
                id="voice-input-sensitivity-threshold"
                v-model.number="inputSensitivityThreshold"
                class="sensitivity-meter-control"
                type="range"
                min="0"
                max="100"
                step="1"
                :disabled="inputSensitivityAuto"
                aria-label="Giriş hassasiyeti eşiği"
              />
            </div>
            <div class="meta sensitivity-meta">
              <template v-if="inputSensitivityAuto">
                Otomatik eşik: {{ effectiveInputThreshold }} - Gürültü: {{ micInputLevelLabel }}
              </template>
              <template v-else>
                Eşik: {{ inputSensitivityThresholdLabel }} - Gürültü: {{ micInputLevelLabel }} - Eşiği çubuk üzerinden sürükleyin
              </template>
            </div>
          </div>
        </div>

        <div class="field">
          <label class="label" for="voice-speaker">HOPARLÖR</label>
          <select
            id="voice-speaker"
            v-model="selectedSpeakerDeviceId"
            class="input select"
            :disabled="devicesLoading || !speakerSelectionAvailable || deviceUpdateKind === 'audiooutput'"
            @change="onSpeakerDeviceChange"
          >
            <option v-for="(device, index) in speakerDevices" :key="`speaker-${device.deviceId}`" :value="device.deviceId">
              {{ formatAudioDeviceLabel(device, 'audiooutput', index) }}
            </option>
          </select>
        </div>

        <div class="field">
          <label class="label" for="voice-speaker-level">SES SEVİYESİ</label>
          <div class="range-row">
            <input id="voice-speaker-level" v-model.number="speakerLevel" class="range" type="range" min="0" max="100" step="1" />
            <span class="range-value">{{ speakerLevelLabel }}</span>
          </div>
        </div>

        <div v-if="deviceError" class="error">{{ deviceError }}</div>
        <div v-if="deviceSuccess" class="success">{{ deviceSuccess }}</div>
      </template>

      <template v-if="tab === SettingsTab.Video">
        <div class="field">
          <label class="label" for="video-mode">VİDEO MODU</label>
          <select
            id="video-mode"
            class="input select"
            :value="selectedVideoMode"
            @change="onVideoModeChange"
          >
            <option :value="VideoMode.Performance">Performans (720p30 + 720p60)</option>
            <option :value="VideoMode.Quality">Kalite (1080p30 + 1080p30)</option>
          </select>
        </div>

        <div class="field">
          <label class="label" for="video-camera">KAMERA</label>
          <select
            id="video-camera"
            v-model="selectedCameraDeviceId"
            class="input select"
            :disabled="videoDevicesLoading"
            @change="onCameraDeviceChange"
          >
            <option v-for="(device, index) in cameraDevices" :key="`cam-${device.deviceId}`" :value="device.deviceId">
              {{ formatVideoDeviceLabel(device, index) }}
            </option>
          </select>
        </div>

        <div class="field">
          <label class="label" for="video-camera-quality">KAMERA KALİTESİ</label>
          <select
            id="video-camera-quality"
            class="input select"
            :value="selectedCameraQuality"
            @change="onCameraQualityChange"
          >
            <option value="720p30">720p 30 FPS</option>
            <option value="720p60">720p 60 FPS</option>
            <option value="1080p30">1080p 30 FPS</option>
            <option value="1080p60">1080p 60 FPS</option>
            <option value="1440p30">1440p 30 FPS</option>
          </select>
        </div>

        <div class="field">
          <label class="label" for="video-screenshare-quality">EKRAN PAYLAŞIM KALİTESİ</label>
          <select
            id="video-screenshare-quality"
            class="input select"
            :value="selectedScreenShareQuality"
            @change="onScreenShareQualityChange"
          >
            <option value="720p30">720p 30 FPS</option>
            <option value="720p60">720p 60 FPS</option>
            <option value="1080p30">1080p 30 FPS</option>
            <option value="1080p60">1080p 60 FPS</option>
            <option value="1440p30">1440p 30 FPS</option>
          </select>
        </div>

        <div v-if="videoError" class="error">{{ videoError }}</div>
        <div v-if="videoSuccess" class="success">{{ videoSuccess }}</div>
      </template>

      <template v-if="tab === SettingsTab.Account">
        <div class="account-list">
          <button class="account-btn" type="button" @click="openChangeUsername">
            <span>Kullanıcı Adını Değiştir</span>
            <span aria-hidden="true">›</span>
          </button>
          <button class="account-btn" type="button" @click="openChangeEmail">
            <span>E-posta Değiştir</span>
            <span aria-hidden="true">›</span>
          </button>
          <button class="account-btn" type="button" @click="openChangePassword">
            <span>Şifre Değiştir</span>
            <span aria-hidden="true">›</span>
          </button>
          <button class="account-btn danger" type="button" @click="openDeleteAccount">
            <span>Hesabı Sil</span>
            <span aria-hidden="true">›</span>
          </button>
        </div>

        <div class="account-email-card">
          <div class="account-email-row">
            <span class="account-email-label">Mevcut e-posta</span>
            <span class="account-email-value">{{ currentEmailLabel }}</span>
          </div>
          <div v-if="pendingEmail" class="account-email-row">
            <span class="account-email-label">Bekleyen e-posta</span>
            <span class="account-email-value">{{ pendingEmail }}</span>
          </div>
          <p v-if="pendingEmailNotice" class="account-email-notice" role="status">
            {{ pendingEmailNotice }}
          </p>
        </div>
      </template>
    </div>
  </Modal>

  <ChangeUsernameModal
    v-model="changeUsernameOpen"
    :initial-username="app.username ?? ''"
    @submit="onSubmitChangedUsername"
  />

  <ChangeEmailModal
    v-model="changeEmailOpen"
    :initial-email="currentEmail"
    :loading="emailLoading"
    :error="emailError"
    @submit="onSubmitChangedEmail"
  />

  <ChangePasswordModal
    v-model="changePasswordOpen"
    :loading="passwordLoading"
    :error="passwordError"
    @submit="onSubmitChangedPassword"
  />

  <DeleteAccountModal
    v-model="deleteAccountOpen"
    :loading="deleteAccountLoading"
    :error="deleteAccountError"
    @confirm="onConfirmDeleteAccount"
  />
</template>

<style scoped>
.settings-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 14px;
}

.settings-tab {
  border: 0;
  background: rgba(255, 255, 255, 0.04);
  color: #8892a4;
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.settings-tab.active {
  color: #eef4ff;
  background: rgba(124, 58, 237, 0.24);
}

.settings-body {
  display: grid;
  gap: 12px;
}

.field {
  display: grid;
  gap: 8px;
}

.label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: #8892a4;
}

.input {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 10px 12px;
  color: #eef4ff;
}

.select {
  width: 100%;
  max-width: 100%;
  min-height: 40px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.select option {
  background: #1a2236;
  color: #eef4ff;
}

.avatar-preview {
  display: inline-flex;
  align-items: center;
}

.avatar-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
}

.avatar-option {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  width: 40px;
  height: 40px;
  padding: 0;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.avatar-option img {
  width: 30px;
  height: 30px;
  border-radius: 999px;
}

.avatar-option.selected {
  border-color: rgba(124, 58, 237, 0.7);
  box-shadow: 0 0 0 1px rgba(124, 58, 237, 0.5);
}

.range-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.range {
  flex: 1;
}

.range-value {
  width: 46px;
  text-align: right;
  font-family: 'JetBrains Mono', monospace;
  color: #94a3b8;
  font-size: 12px;
}

.check-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #d1d9e8;
  font-size: 13px;
}

.nc-method-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
  margin-bottom: 4px;
}

.label-small {
  color: #94a3b8;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
}

.nc-method-select {
  max-width: 260px;
  font-size: 13px;
}

.sensitivity-card {
  display: grid;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
}

.sensitivity-meter {
  --noise-level: 0%;
  --threshold-level: 42%;
  position: relative;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
}

.sensitivity-meter.manual {
  cursor: ew-resize;
}

.sensitivity-meter-track {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    #f59e0b 0%,
    #f59e0b 34%,
    #22c55e 34%,
    #22c55e 74%,
    #a855f7 74%,
    #a855f7 100%
  );
  opacity: 0.9;
}

.sensitivity-meter-live {
  position: absolute;
  inset: 0 auto 0 0;
  width: var(--noise-level);
  background: rgba(241, 245, 249, 0.42);
}

.sensitivity-meter-threshold {
  position: absolute;
  top: -2px;
  bottom: -2px;
  left: var(--threshold-level);
  width: 2px;
  border-radius: 999px;
  background: #f8fafc;
  box-shadow: 0 0 0 1px rgba(2, 6, 23, 0.38);
}

.sensitivity-meter-control {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  background: transparent;
  border: 0;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  cursor: inherit;
}

.sensitivity-meter-control:disabled {
  pointer-events: none;
}

.sensitivity-meter-control::-webkit-slider-runnable-track {
  height: 10px;
  background: transparent;
}

.sensitivity-meter-control::-moz-range-track {
  height: 10px;
  background: transparent;
  border: 0;
}

.sensitivity-meter-control::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 11px;
  height: 18px;
  margin-top: -4px;
  border-radius: 999px;
  border: 1px solid rgba(15, 23, 42, 0.7);
  background: #f8fafc;
  opacity: 0;
  box-shadow: 0 1px 4px rgba(2, 6, 23, 0.45);
}

.sensitivity-meter-control::-moz-range-thumb {
  width: 11px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid rgba(15, 23, 42, 0.7);
  background: #f8fafc;
  opacity: 0;
  box-shadow: 0 1px 4px rgba(2, 6, 23, 0.45);
}

.sensitivity-meter.manual .sensitivity-meter-control::-webkit-slider-thumb {
  opacity: 1;
}

.sensitivity-meter.manual .sensitivity-meter-control::-moz-range-thumb {
  opacity: 1;
}

.sensitivity-meta {
  font-size: 11px;
}

.actions {
  display: flex;
  justify-content: flex-end;
}

.btn {
  border: 0;
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.primary {
  color: #e9ddff;
  background: rgba(124, 58, 237, 0.3);
}

.account-list {
  display: grid;
  gap: 8px;
}

.account-btn {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  color: #d1d9e8;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  font-size: 13px;
  cursor: pointer;
}

.account-btn.danger {
  color: #fda4af;
  border-color: rgba(244, 63, 94, 0.28);
  background: rgba(244, 63, 94, 0.08);
}

.account-email-card {
  display: grid;
  gap: 8px;
  padding: 11px 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.025);
}

.account-email-row {
  display: grid;
  grid-template-columns: minmax(0, 0.75fr) minmax(0, 1.25fr);
  gap: 12px;
  align-items: baseline;
}

.account-email-label {
  color: #94a3b8;
  font-size: 12px;
}

.account-email-value {
  min-width: 0;
  overflow-wrap: anywhere;
  color: #d1d9e8;
  font-size: 12px;
  text-align: right;
}

.account-email-notice {
  margin: 2px 0 0;
  padding-top: 9px;
  border-top: 1px solid rgba(34, 211, 238, 0.14);
  color: #a5c9d5;
  font-size: 12px;
  line-height: 1.55;
}

.meta {
  color: #94a3b8;
  font-size: 12px;
}

.error {
  color: #f87171;
  font-size: 12px;
}

.success {
  color: #34d399;
  font-size: 12px;
}

@media (max-width: 1023px) {
  .avatar-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}
</style>
