<script setup lang="ts">
import { computed, ref } from 'vue'
import type {
  ChatComposerAttachmentDraft,
  ChatMessageLinkPreview,
} from '@/src/features/messages/types'
import {
  ChatComposerActionKind,
  ChatLinkPreviewCardVariant,
} from '@/src/features/messages/types'
import MessageComposerInput from './MessageComposerInput.vue'
import MessageComposerActionRow from './MessageComposerActionRow.vue'
import MessageComposerAttachmentTray from './MessageComposerAttachmentTray.vue'
import ChatMessageLinkPreviewCard from '~/components/ui/messages/ChatMessageLinkPreview.vue'

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder: string
  disabled?: boolean
  isSending?: boolean
  canSend?: boolean
  attachments?: ChatComposerAttachmentDraft[]
  linkPreview?: ChatMessageLinkPreview | null
  linkPreviewLoading?: boolean
  linkPreviewError?: string
}>(), {
  disabled: false,
  isSending: false,
  canSend: false,
  attachments: () => [],
  linkPreview: null,
  linkPreviewLoading: false,
  linkPreviewError: '',
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'send'): void
  (event: 'attach'): void
  (event: 'removeAttachment', attachmentId: string): void
  (event: 'retryAttachment', attachmentId: string): void
  (event: 'clearPreview'): void
  (event: 'focus'): void
  (event: 'blur'): void
  (event: 'paste', value: ClipboardEvent): void
  (event: 'dropFiles', value: FileList): void
}>()

const isDragging = ref(false)
const hasAttachments = computed(() => props.attachments.length > 0)
const actionKind = ChatComposerActionKind
const linkPreviewVariant = ChatLinkPreviewCardVariant
const canTriggerSend = computed(() => !props.disabled && !props.isSending && props.canSend)

const emitSendIfAllowed = () => {
  if (!canTriggerSend.value) return
  emit('send')
}

const onDragEnter = () => {
  if (props.disabled) return
  isDragging.value = true
}

const onDragLeave = (event: DragEvent) => {
  const currentTarget = event.currentTarget as HTMLElement | null
  const relatedTarget = event.relatedTarget as Node | null
  if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) return
  isDragging.value = false
}

const onDrop = (event: DragEvent) => {
  isDragging.value = false
  if (props.disabled) return
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return
  emit('dropFiles', files)
}
</script>

<template>
  <div
    class="message-composer-shell"
    :class="{
      'message-composer-shell--disabled': props.disabled,
      'message-composer-shell--dragging': isDragging,
    }"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <ChatMessageLinkPreviewCard
      :preview="props.linkPreview"
      :loading="props.linkPreviewLoading"
      :error-message="props.linkPreviewError"
      :clearable="true"
      :variant="linkPreviewVariant.Composer"
      @clear="$emit('clearPreview')"
    />

    <MessageComposerAttachmentTray
      v-if="hasAttachments"
      :attachments="props.attachments"
      @remove="$emit('removeAttachment', $event)"
      @retry="$emit('retryAttachment', $event)"
    />

    <div class="message-composer-shell__row">
      <MessageComposerActionRow
        :action-kind="actionKind.Attach"
        class="message-composer-shell__left-action"
        :disabled="props.disabled"
        @attach="$emit('attach')"
      />

      <MessageComposerInput
        class="message-composer-shell__input"
        :model-value="props.modelValue"
        :placeholder="props.placeholder"
        :disabled="props.disabled"
        @update:model-value="$emit('update:modelValue', $event)"
        @send="emitSendIfAllowed"
        @focus="$emit('focus')"
        @blur="$emit('blur')"
        @paste="$emit('paste', $event)"
      />

      <MessageComposerActionRow
        :action-kind="actionKind.Send"
        class="message-composer-shell__right-action"
        :disabled="props.disabled"
        :is-sending="props.isSending"
        :can-send="props.canSend"
        @send="emitSendIfAllowed"
      />
    </div>
  </div>
</template>

<style scoped>
.message-composer-shell {
  width: 100%;
  min-height: 52px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.04);
  padding: 10px 12px;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.message-composer-shell:focus-within {
  border-color: rgba(124, 58, 237, 0.4);
  box-shadow: 0 0 0 1px rgba(124, 58, 237, 0.15);
}

.message-composer-shell--disabled {
  opacity: 0.6;
}

.message-composer-shell--dragging {
  border-color: rgba(34, 211, 238, 0.55);
  box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.2);
}

.message-composer-shell__row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}

.message-composer-shell__left-action,
.message-composer-shell__right-action {
  align-self: center;
}

.message-composer-shell__input {
  min-width: 0;
}

@media (max-width: 1023px) {
  .message-composer-shell {
    border-radius: 10px;
    padding: 8px 10px;
  }

  .message-composer-shell__row {
    gap: 9px;
  }
}
</style>
