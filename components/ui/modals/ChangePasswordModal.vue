<script setup lang="ts">
import Modal from '../Modal.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  loading?: boolean
  error?: string
  success?: string
}>(), {
  loading: false,
  error: '',
  success: '',
})

const emit = defineEmits<{
  'update:modelValue': [boolean]
  submit: [{ password: string; confirmPassword: string }]
}>()

const password = ref('')
const confirmPassword = ref('')
const localError = ref('')

function onSubmit() {
  localError.value = ''

  const trimmedPassword = password.value.trim()
  const trimmedConfirm = confirmPassword.value.trim()
  if (!trimmedPassword || !trimmedConfirm) {
    localError.value = 'Her iki alan da gerekli'
    return
  }
  if (trimmedPassword !== trimmedConfirm) {
    localError.value = 'Şifreler eşleşmiyor'
    return
  }

  emit('submit', {
    password: trimmedPassword,
    confirmPassword: trimmedConfirm,
  })
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    password.value = ''
    confirmPassword.value = ''
    localError.value = ''
  },
  { immediate: true }
)
</script>

<template>
  <Modal
    :model-value="props.modelValue"
    title="Şifre Değiştir"
    :show-back="true"
    @update:model-value="emit('update:modelValue', $event)"
    @back="emit('update:modelValue', false)"
  >
    <div class="field">
      <label class="label" for="change-password">YENİ ŞİFRE</label>
      <input id="change-password" v-model="password" class="input" type="password" autocomplete="new-password" />
    </div>

    <div class="field">
      <label class="label" for="change-password-confirm">ŞİFREYİ ONAYLA</label>
      <input id="change-password-confirm" v-model="confirmPassword" class="input" type="password" autocomplete="new-password" />
    </div>

    <div v-if="localError" class="error">{{ localError }}</div>
    <div v-if="props.error" class="error">{{ props.error }}</div>
    <div v-if="props.success" class="success">{{ props.success }}</div>

    <div class="actions">
      <button class="btn ghost" type="button" @click="emit('update:modelValue', false)">İptal</button>
      <button class="btn primary" type="button" :disabled="props.loading" @click="onSubmit">
        {{ props.loading ? 'Güncelleniyor...' : 'Kaydet' }}
      </button>
    </div>
  </Modal>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field + .field {
  margin-top: 12px;
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

.error {
  margin-top: 10px;
  color: #f87171;
  font-size: 12px;
}

.success {
  margin-top: 10px;
  color: #34d399;
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

.btn.primary {
  color: #e9ddff;
  background: rgba(124, 58, 237, 0.3);
}
</style>
