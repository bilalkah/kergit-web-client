<script setup lang="ts">
import Modal from '../Modal.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  channelName: string
  hasChanges: boolean
  canManage?: boolean
  canDelete?: boolean
  renameError?: string
  deleteError?: string
  deleteConfirm?: boolean
}>(), {
  canManage: false,
  canDelete: false,
  renameError: '',
  deleteError: '',
  deleteConfirm: false,
})

const emit = defineEmits<{
  'update:modelValue': [boolean]
  'update:channelName': [string]
  save: []
  delete: []
}>()
</script>

<template>
  <Modal
    :model-value="props.modelValue"
    title="Kanal Ayarları"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="channel-settings">
      <p class="modal-sub">Kanal adını güncelle.</p>

      <div class="field">
        <label class="label" for="channel-settings-name">KANAL ADI</label>
        <input
          id="channel-settings-name"
          class="input"
          type="text"
          maxlength="80"
          :value="props.channelName"
          :readonly="!props.canManage"
          @input="emit('update:channelName', ($event.target as HTMLInputElement | null)?.value ?? '')"
        />
      </div>

      <div v-if="props.renameError" class="error">{{ props.renameError }}</div>

      <div class="actions">
        <button class="btn ghost" type="button" @click="emit('update:modelValue', false)">Vazgeç</button>
        <button
          v-if="props.canManage"
          class="btn primary"
          type="button"
          :disabled="!props.hasChanges"
          @click="emit('save')"
        >
          Kaydet
        </button>
      </div>

      <div v-if="props.canDelete" class="danger-zone">
        <div class="danger-title">Kanalı sil</div>
        <div class="danger-sub">Bu işlem kanalı ve mesajlarını kaldırır.</div>
        <button class="btn danger" type="button" @click="emit('delete')">
          {{ props.deleteConfirm ? 'Silmeyi onayla' : 'Kanalı sil' }}
        </button>
        <div v-if="props.deleteError" class="error">{{ props.deleteError }}</div>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.channel-settings {
  display: grid;
  gap: 12px;
}

.modal-sub {
  margin: 0;
  color: #94a3b8;
  font-size: 13px;
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
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: #eef4ff;
  padding: 10px 12px;
  outline: none;
}

.input:focus {
  border-color: rgba(124, 58, 237, 0.5);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.danger-zone {
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: grid;
  gap: 8px;
}

.danger-title {
  color: #fff;
  font-size: 14px;
  font-weight: 600;
}

.danger-sub {
  color: #94a3b8;
  font-size: 12px;
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
  color: #d1d9e8;
  background: rgba(255, 255, 255, 0.05);
}

.btn.primary {
  color: #efe7ff;
  background: rgba(124, 58, 237, 0.32);
}

.btn.danger {
  color: #fee2e2;
  background: rgba(127, 29, 29, 0.82);
}

.error {
  font-size: 12px;
  color: #f87171;
}
</style>
