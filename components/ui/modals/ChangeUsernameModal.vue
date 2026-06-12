<script setup lang="ts">
import Modal from '../Modal.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  initialUsername?: string
}>(), {
  initialUsername: '',
})

const emit = defineEmits<{
  'update:modelValue': [boolean]
  submit: [string]
}>()

const username = ref('')
const localError = ref('')

function onSubmit() {
  localError.value = ''
  const trimmed = username.value.trim()
  if (!trimmed) {
    localError.value = 'Kullanıcı adı gerekli'
    return
  }
  emit('submit', trimmed)
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    username.value = props.initialUsername ?? ''
    localError.value = ''
  },
  { immediate: true }
)
</script>

<template>
  <Modal
    :model-value="props.modelValue"
    title="Kullanıcı Adını Değiştir"
    :show-back="true"
    @update:model-value="emit('update:modelValue', $event)"
    @back="emit('update:modelValue', false)"
  >
    <div class="field">
      <label class="label" for="change-username">YENİ KULLANICI ADI</label>
      <input id="change-username" v-model="username" class="input" type="text" maxlength="32" />
    </div>

    <div v-if="localError" class="error">{{ localError }}</div>

    <div class="actions">
      <button class="btn ghost" type="button" @click="emit('update:modelValue', false)">İptal</button>
      <button class="btn primary" type="button" @click="onSubmit">Kaydet</button>
    </div>
  </Modal>
</template>

<style scoped>
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

.btn.ghost {
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.04);
}

.btn.primary {
  color: #e9ddff;
  background: rgba(124, 58, 237, 0.3);
}
</style>
