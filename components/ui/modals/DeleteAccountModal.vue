<script setup lang="ts">
import Modal from '../Modal.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  loading?: boolean
  error?: string
}>(), {
  loading: false,
  error: '',
})

const emit = defineEmits<{
  'update:modelValue': [boolean]
  confirm: []
}>()

const confirmText = ref('')
const localError = ref('')

function onConfirm() {
  localError.value = ''
  if (confirmText.value.trim().toUpperCase() !== 'SIL') {
    localError.value = 'Devam etmek için SIL yaz'
    return
  }
  emit('confirm')
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    confirmText.value = ''
    localError.value = ''
  },
  { immediate: true }
)
</script>

<template>
  <Modal
    :model-value="props.modelValue"
    title="Hesabı Sil"
    :show-back="true"
    @update:model-value="emit('update:modelValue', $event)"
    @back="emit('update:modelValue', false)"
  >
    <p class="warning">
      Bu işlem geri alınamaz. Devam etmek için aşağıya
      <strong>SIL</strong> yaz.
    </p>

    <div class="field">
      <label class="label" for="delete-confirm">ONAY</label>
      <input id="delete-confirm" v-model="confirmText" class="input" type="text" />
    </div>

    <div v-if="localError" class="error">{{ localError }}</div>
    <div v-if="props.error" class="error">{{ props.error }}</div>

    <div class="actions">
      <button class="btn ghost" type="button" @click="emit('update:modelValue', false)">İptal</button>
      <button class="btn danger" type="button" :disabled="props.loading" @click="onConfirm">
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
