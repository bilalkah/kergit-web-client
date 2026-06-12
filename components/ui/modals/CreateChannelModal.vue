<script setup lang="ts">
import Modal from '../Modal.vue'
import { ChannelType } from '~/stores/app'

const props = withDefaults(defineProps<{
  modelValue: boolean
  channelType: ChannelType
  channelName: string
  canCreate?: boolean
  submitting?: boolean
  error?: string
}>(), {
  canCreate: true,
  submitting: false,
  error: '',
})

const emit = defineEmits<{
  'update:modelValue': [boolean]
  'update:channelType': [ChannelType]
  'update:channelName': [string]
  create: []
}>()

const canSubmit = computed(() =>
  props.canCreate && !props.submitting && props.channelName.trim().length > 0
)

const closeModal = () => {
  emit('update:modelValue', false)
}
</script>

<template>
  <Modal
    :model-value="props.modelValue"
    title="Kanal Oluştur"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="channel-modal">
      <p class="modal-sub">Yeni bir metin ya da ses kanalı ekle.</p>

      <div class="field">
        <label class="label">KANAL TÜRÜ</label>
        <div class="type-toggle">
          <button
            class="type-btn"
            :class="{ active: props.channelType === ChannelType.Text }"
            type="button"
            :disabled="!props.canCreate"
            @click="emit('update:channelType', ChannelType.Text)"
          >
            Metin
          </button>
          <button
            class="type-btn"
            :class="{ active: props.channelType === ChannelType.Voice }"
            type="button"
            :disabled="!props.canCreate"
            @click="emit('update:channelType', ChannelType.Voice)"
          >
            Ses
          </button>
        </div>
      </div>

      <div class="field">
        <label class="label" for="create-channel-name">KANAL ADI</label>
        <input
          id="create-channel-name"
          class="input"
          type="text"
          placeholder="genel"
          :value="props.channelName"
          :readonly="!props.canCreate"
          @input="emit('update:channelName', ($event.target as HTMLInputElement | null)?.value ?? '')"
        />
      </div>

      <div v-if="props.error" class="error">{{ props.error }}</div>

      <div class="actions">
        <button class="btn ghost" type="button" @click="closeModal">İptal</button>
        <button
          class="btn primary"
          type="button"
          :disabled="!canSubmit"
          :aria-busy="props.submitting ? 'true' : 'false'"
          @click="emit('create')"
        >
          {{ props.submitting ? 'Oluşturuluyor...' : 'Oluştur' }}
        </button>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.channel-modal {
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

.type-toggle {
  display: inline-flex;
  width: fit-content;
  gap: 6px;
}

.type-btn {
  border: 0;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: #94a3b8;
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.type-btn.active {
  color: #eef4ff;
  background: rgba(124, 58, 237, 0.28);
}

.type-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

.error {
  font-size: 12px;
  color: #f87171;
}

.actions {
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
  color: #d1d9e8;
  background: rgba(255, 255, 255, 0.05);
}

.btn.primary {
  color: #efe7ff;
  background: rgba(124, 58, 237, 0.32);
}
</style>
