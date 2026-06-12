<script setup lang="ts">
import { protoService } from '@/src/services/proto'
import Modal from '../Modal.vue'
import { useAppStore } from '~/stores/app'
import { useWebSocket } from '~/composables/useWebSocket'

type HubModalView = 'initial' | 'create' | 'join'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
}>()

const app = useAppStore()
const socket = useWebSocket()

const view = ref<HubModalView>('initial')
const hubName = ref('')
const inviteCode = ref('')
const errorText = ref('')
const isSubmitting = ref(false)
const hubCreateType = ref(protoService.EnvelopeType.HUB_CREATE as number)
const hubJoinType = ref(protoService.EnvelopeType.HUB_JOIN as number)

const modalTitle = computed(() => {
  if (view.value === 'create') return 'Sunucu Oluştur'
  if (view.value === 'join') return 'Kodla Katıl'
  return 'Sunucu Oluştur veya Katıl'
})

const activeCommandType = computed(() => {
  if (view.value === 'create') return hubCreateType.value
  if (view.value === 'join') return hubJoinType.value
  return 0
})

const canCreate = computed(() =>
  hubName.value.trim().length > 0 && !isSubmitting.value
)

const canJoin = computed(() =>
  inviteCode.value.trim().length > 0 && !isSubmitting.value
)

function resetState() {
  view.value = 'initial'
  hubName.value = ''
  inviteCode.value = ''
  errorText.value = ''
  isSubmitting.value = false
}

const closeModal = () => {
  emit('update:modelValue', false)
}

function onBack() {
  view.value = 'initial'
  errorText.value = ''
  isSubmitting.value = false
}

function normalizeInviteCode(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  // Extract token from invite URLs: https://domain/invite/TOKEN
  const inviteMatch = trimmed.match(/\/invite\/([a-zA-Z0-9]+)/)
  const inviteToken = inviteMatch?.[1]
  if (inviteToken) return inviteToken
  // Fallback: strip protocol and extract last path segment
  const noProtocol = trimmed.replace(/^https?:\/\//i, '')
  const slashIndex = noProtocol.lastIndexOf('/')
  if (slashIndex === -1) return noProtocol
  return noProtocol.slice(slashIndex + 1)
}

async function createHub() {
  const trimmedName = hubName.value.trim()
  if (!trimmedName) return
  if (!socket.connected.value) {
    errorText.value = 'Bağlantı hazır değil'
    return
  }

  app.clearCommandError(hubCreateType.value)
  errorText.value = ''
  isSubmitting.value = true
  await socket.createHub(trimmedName)
}

async function joinHub() {
  const normalizedCode = normalizeInviteCode(inviteCode.value)
  if (!normalizedCode) return
  if (!socket.connected.value) {
    errorText.value = 'Bağlantı hazır değil'
    return
  }

  app.clearCommandError(hubJoinType.value)
  errorText.value = ''
  isSubmitting.value = true
  await socket.joinHub(normalizedCode)
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      resetState()
      return
    }
    app.clearCommandError(hubCreateType.value)
    app.clearCommandError(hubJoinType.value)
  },
  { immediate: true }
)

watch(
  () => app.commandErrors,
  () => {
    const commandType = activeCommandType.value
    if (!commandType || !props.modelValue) return
    const entry = app.commandErrors[commandType]
    if (!entry) return
    errorText.value = entry.message
    isSubmitting.value = false
  },
  { deep: true }
)

watch(
  () => app.lastHubEventAt,
  (stamp) => {
    if (!stamp || !props.modelValue || !isSubmitting.value) return
    closeModal()
  }
)
</script>

<template>
  <Modal
    :model-value="props.modelValue"
    :title="modalTitle"
    :show-back="view !== 'initial'"
    @update:model-value="emit('update:modelValue', $event)"
    @back="onBack"
  >
    <div v-if="view === 'initial'" class="hub-mode-grid">
      <button class="hub-mode-btn" type="button" @click="view = 'create'">
        <span class="hub-mode-title">⊕ Yeni sunucu oluştur →</span>
        <span class="hub-mode-sub">Kendi alanınla başla</span>
      </button>

      <button class="hub-mode-btn" type="button" @click="view = 'join'">
        <span class="hub-mode-title">☐ Kodla katıl →</span>
        <span class="hub-mode-sub">Zaten davet kodun var mı?</span>
      </button>
    </div>

    <div v-else-if="view === 'create'" class="hub-mode-panel">
      <label class="hub-label" for="hub-create-name">SUNUCU ADI</label>
      <input
        id="hub-create-name"
        v-model="hubName"
        class="hub-input"
        type="text"
        placeholder="Benim Sunucum"
      />

      <div v-if="errorText" class="hub-error">{{ errorText }}</div>

      <div class="hub-actions">
        <button class="hub-btn ghost" type="button" @click="onBack">Geri</button>
        <button
          class="hub-btn primary"
          type="button"
          :disabled="!canCreate"
          :aria-busy="isSubmitting ? 'true' : 'false'"
          @click="createHub"
        >
          {{ isSubmitting ? 'Oluşturuluyor...' : 'Oluştur' }}
        </button>
      </div>
    </div>

    <div v-else class="hub-mode-panel">
      <label class="hub-label" for="hub-join-code">DAVET KODU</label>
      <input
        id="hub-join-code"
        v-model="inviteCode"
        class="hub-input"
        type="text"
        placeholder="/invite/aBcDeF1234"
      />
      <div class="hub-help">Davet bağlantısını veya kodunu yapıştırın</div>

      <div v-if="errorText" class="hub-error">{{ errorText }}</div>

      <div class="hub-actions">
        <button class="hub-btn ghost" type="button" @click="onBack">Geri</button>
        <button
          class="hub-btn primary"
          type="button"
          :disabled="!canJoin"
          :aria-busy="isSubmitting ? 'true' : 'false'"
          @click="joinHub"
        >
          {{ isSubmitting ? 'Katılıyor...' : 'Katıl' }}
        </button>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.hub-mode-grid {
  display: grid;
  gap: 10px;
}

.hub-mode-btn {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  color: #eef4ff;
  padding: 12px;
  text-align: left;
  display: grid;
  gap: 4px;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.hub-mode-btn:hover {
  border-color: rgba(124, 58, 237, 0.44);
  background: rgba(124, 58, 237, 0.12);
}

.hub-mode-title {
  font-size: 14px;
  font-weight: 600;
}

.hub-mode-sub {
  font-size: 12px;
  color: #94a3b8;
}

.hub-mode-panel {
  display: grid;
  gap: 10px;
}

.hub-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: #8892a4;
}

.hub-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: #eef4ff;
  font-size: 14px;
  padding: 10px 12px;
  outline: none;
}

.hub-input:focus {
  border-color: rgba(124, 58, 237, 0.5);
}

.hub-help {
  margin-top: -4px;
  font-size: 12px;
  color: #94a3b8;
}

.hub-error {
  font-size: 12px;
  color: #f87171;
}

.hub-actions {
  margin-top: 4px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.hub-btn {
  border: 0;
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.hub-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hub-btn.ghost {
  color: #d1d9e8;
  background: rgba(255, 255, 255, 0.05);
}

.hub-btn.primary {
  color: #efe7ff;
  background: rgba(124, 58, 237, 0.32);
}
</style>
