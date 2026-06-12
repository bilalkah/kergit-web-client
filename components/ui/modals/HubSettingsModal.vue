<script setup lang="ts">
import { hubAvatarUrl } from '@/src/utils/avatar'
import Modal from '../Modal.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  hubName: string
  selectedAvatarSeed: string
  avatarSeeds: string[]
  hasChanges: boolean
  canManage?: boolean
  canDelete?: boolean
  renameError?: string
  avatarError?: string
  deleteConfirm?: boolean
}>(), {
  canManage: false,
  canDelete: false,
  renameError: '',
  avatarError: '',
  deleteConfirm: false,
})

const emit = defineEmits<{
  'update:modelValue': [boolean]
  'update:hubName': [string]
  'update:selectedAvatarSeed': [string]
  save: []
  delete: []
}>()

function onHubNameInput(event: Event) {
  const target = event.target as HTMLInputElement | null
  emit('update:hubName', target?.value ?? '')
}
</script>

<template>
  <Modal
    :model-value="props.modelValue"
    title="Sunucu Ayarları"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="hub-settings">
      <p class="modal-sub">Sunucu bilgilerini güncelle.</p>

      <div class="field">
        <label class="label" for="hub-settings-name">SUNUCU ADI</label>
        <input
          id="hub-settings-name"
          class="input"
          type="text"
          :value="props.hubName"
          :readonly="!props.canManage"
          @input="onHubNameInput"
        />
      </div>

      <div v-if="props.renameError" class="error">{{ props.renameError }}</div>

      <div class="field">
        <label class="label">SUNUCU AVATARI</label>
        <div class="avatar-grid" :class="{ disabled: !props.canManage }">
          <button
            v-for="seed in props.avatarSeeds"
            :key="seed"
            class="avatar-option"
            :class="{ selected: seed === props.selectedAvatarSeed }"
            :disabled="!props.canManage"
            type="button"
            @click="emit('update:selectedAvatarSeed', seed)"
          >
            <img :src="hubAvatarUrl(seed)" :alt="seed" />
          </button>
        </div>
      </div>

      <div v-if="props.avatarError" class="error">{{ props.avatarError }}</div>

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
        <div class="danger-title">Sunucuyu sil</div>
        <div class="danger-sub">Bu işlem sunucuyu ve tüm içeriğini kaldırır.</div>
        <button class="btn danger" type="button" @click="emit('delete')">
          {{ props.deleteConfirm ? 'Silmeyi onayla' : 'Sunucuyu sil' }}
        </button>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.hub-settings {
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

.avatar-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
}

.avatar-grid.disabled {
  opacity: 0.6;
  pointer-events: none;
}

.avatar-option {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.25);
  overflow: hidden;
  cursor: pointer;
  padding: 0;
}

.avatar-option img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.avatar-option.selected {
  border-color: rgba(99, 102, 241, 1);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.35);
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

@media (max-width: 1023px) {
  .avatar-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>
