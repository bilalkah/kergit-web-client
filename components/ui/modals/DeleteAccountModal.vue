<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Modal from '../Modal.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  currentEmail?: string
  loading?: boolean
  error?: string
}>(), {
  currentEmail: '',
  loading: false,
  error: '',
})

const emit = defineEmits<{
  'update:modelValue': [boolean]
  confirm: [string]
}>()

const confirmText = ref('')
const validationRequested = ref(false)

const normalizedCurrentEmail = computed(() => props.currentEmail.trim())
const normalizedConfirmation = computed(() => confirmText.value.trim())
const hasCurrentEmail = computed(() => normalizedCurrentEmail.value.length > 0)

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

const confirmationMatches = computed(() =>
  hasCurrentEmail.value
  && looksLikeEmail(normalizedConfirmation.value)
  && normalizedConfirmation.value.toLowerCase() === normalizedCurrentEmail.value.toLowerCase()
)

const canSubmit = computed(() => !props.loading && confirmationMatches.value)

const validationError = computed(() => {
  if (!validationRequested.value || !hasCurrentEmail.value) return ''
  if (!normalizedConfirmation.value) return 'Devam etmek için mevcut e-posta adresini yaz.'
  if (!looksLikeEmail(normalizedConfirmation.value)) return 'Geçerli bir e-posta adresi yaz.'
  if (!confirmationMatches.value) return 'E-posta adresi mevcut hesabınla eşleşmiyor.'
  return ''
})

function onConfirm() {
  validationRequested.value = true
  if (!canSubmit.value) return

  emit('confirm', normalizedConfirmation.value)
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    confirmText.value = ''
    validationRequested.value = false
  },
  { immediate: true }
)
</script>

<template>
  <Modal
    :model-value="props.modelValue"
    title="Hesabı Sil"
    :show-back="true"
    :dismissible="!props.loading"
    @update:model-value="emit('update:modelValue', $event)"
    @back="!props.loading && emit('update:modelValue', false)"
  >
    <p class="warning">
      Bu işlem geri alınamaz. Devam etmek için mevcut e-posta adresini yaz.
    </p>

    <div class="field">
      <label class="label" for="delete-confirm">E-POSTA ONAYI</label>
      <input
        id="delete-confirm"
        v-model="confirmText"
        class="input"
        type="email"
        autocomplete="email"
        :disabled="props.loading"
        @blur="validationRequested = true"
      />
    </div>

    <div v-if="!hasCurrentEmail" class="error">Mevcut e-posta doğrulanamadı. Lütfen tekrar giriş yap.</div>
    <div v-if="validationError" class="error">{{ validationError }}</div>
    <div v-if="props.error" class="error">{{ props.error }}</div>

    <div class="actions">
      <button class="btn ghost" type="button" :disabled="props.loading" @click="emit('update:modelValue', false)">İptal</button>
      <button class="btn danger" type="button" :disabled="!canSubmit" @click="onConfirm">
        {{ props.loading ? 'İşleniyor...' : 'Hesabı Sil' }}
      </button>
    </div>
  </Modal>
</template>

<style scoped>
.warning {
  margin: 0 0 10px;
  color: #fda4af;
  font-size: 13px;
  line-height: 1.5;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.label {
  font-size: 11px;
  font-weight: 600;
  color: #8892a4;
  letter-spacing: 0.05em;
}

.input {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 10px 12px;
  color: #eef4ff;
}

.input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error {
  margin-top: 10px;
  color: #f87171;
  font-size: 12px;
}

.actions {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
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

.btn.ghost {
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.04);
}

.btn.danger {
  color: #fecdd3;
  background: rgba(244, 63, 94, 0.28);
}
</style>
