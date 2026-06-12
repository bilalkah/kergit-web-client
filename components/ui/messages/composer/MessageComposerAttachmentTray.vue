<script setup lang="ts">
import {
  ChatAttachmentKind,
  ChatComposerAttachmentUploadStatus,
  type ChatComposerAttachmentDraft,
} from '@/src/features/messages/types'

const props = defineProps<{
  attachments: ChatComposerAttachmentDraft[]
}>()

defineEmits<{
  (event: 'remove', attachmentId: string): void
  (event: 'retry', attachmentId: string): void
}>()

const formatSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const statusLabel = (attachment: ChatComposerAttachmentDraft): string => {
  switch (attachment.uploadStatus) {
    case ChatComposerAttachmentUploadStatus.Uploading:
      return 'Yukleniyor'
    case ChatComposerAttachmentUploadStatus.Uploaded:
      return 'Yuklendi'
    case ChatComposerAttachmentUploadStatus.Failed:
      return 'Basarisiz'
    case ChatComposerAttachmentUploadStatus.Draft:
    default:
      return 'Hazir'
  }
}

const statusClass = (attachment: ChatComposerAttachmentDraft): string => {
  switch (attachment.uploadStatus) {
    case ChatComposerAttachmentUploadStatus.Uploading:
      return 'composer-attachment__status--uploading'
    case ChatComposerAttachmentUploadStatus.Uploaded:
      return 'composer-attachment__status--uploaded'
    case ChatComposerAttachmentUploadStatus.Failed:
      return 'composer-attachment__status--failed'
    case ChatComposerAttachmentUploadStatus.Draft:
    default:
      return 'composer-attachment__status--draft'
  }
}

const showRetryButton = (attachment: ChatComposerAttachmentDraft): boolean =>
  attachment.uploadStatus === ChatComposerAttachmentUploadStatus.Failed

const showUploadingSpinner = (attachment: ChatComposerAttachmentDraft): boolean =>
  attachment.uploadStatus === ChatComposerAttachmentUploadStatus.Uploading
</script>

<template>
  <section v-if="props.attachments.length > 0" class="composer-attachments">
    <article
      v-for="attachment in props.attachments"
      :key="attachment.id"
      class="composer-attachment"
      :class="{
        'composer-attachment--image': attachment.kind === ChatAttachmentKind.Image,
      }"
    >
      <template v-if="attachment.kind === ChatAttachmentKind.Image && attachment.previewUrl">
        <img
          class="composer-attachment__image"
          :src="attachment.previewUrl"
          :alt="attachment.displayName || 'Gorsel eki'"
        />
      </template>
      <template v-else>
        <div class="composer-attachment__file-icon" aria-hidden="true">FILE</div>
      </template>

      <div class="composer-attachment__meta">
        <p class="composer-attachment__name">{{ attachment.displayName || 'Dosya' }}</p>
        <p class="composer-attachment__detail">
          {{ attachment.mimeType || 'application/octet-stream' }}
          <template v-if="attachment.sizeBytes > 0"> · {{ formatSize(attachment.sizeBytes) }}</template>
        </p>

        <div class="composer-attachment__status-line">
          <span class="composer-attachment__status" :class="statusClass(attachment)">
            <span v-if="showUploadingSpinner(attachment)" class="composer-attachment__spinner" aria-hidden="true"></span>
            {{ statusLabel(attachment) }}
          </span>
          <button
            v-if="showRetryButton(attachment)"
            type="button"
            class="composer-attachment__retry"
            @click="$emit('retry', attachment.id)"
          >
            Tekrar dene
          </button>
        </div>

        <p v-if="attachment.uploadErrorMessage" class="composer-attachment__error">
          {{ attachment.uploadErrorMessage }}
        </p>
      </div>

      <button
        class="composer-attachment__remove"
        type="button"
        aria-label="Eki kaldir"
        @click="$emit('remove', attachment.id)"
      >
        x
      </button>
    </article>
  </section>
</template>

<style scoped>
.composer-attachments {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 8px;
  margin-bottom: 8px;
}

.composer-attachment {
  min-height: 64px;
  border: 1px solid rgba(148, 163, 184, 0.23);
  background: rgba(15, 23, 42, 0.38);
  border-radius: 10px;
  padding: 8px 10px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
}

.composer-attachment--image {
  align-items: stretch;
}

.composer-attachment__image {
  width: 50px;
  height: 50px;
  border-radius: 8px;
  object-fit: cover;
  display: block;
  background: rgba(2, 6, 23, 0.6);
}

.composer-attachment__file-icon {
  width: 50px;
  height: 50px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: rgba(148, 163, 184, 0.14);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: #c7d2e6;
}

.composer-attachment__meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.composer-attachment__name {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: #e2e8f0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.composer-attachment__detail {
  margin: 0;
  font-size: 11px;
  color: #9aa5bd;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.composer-attachment__status-line {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.composer-attachment__status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
}

.composer-attachment__status--draft {
  color: #94a3b8;
}

.composer-attachment__status--uploading {
  color: #7dd3fc;
}

.composer-attachment__status--uploaded {
  color: #34d399;
}

.composer-attachment__status--failed {
  color: #fca5a5;
}

.composer-attachment__spinner {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  border: 2px solid rgba(125, 211, 252, 0.25);
  border-top-color: rgba(125, 211, 252, 0.95);
  animation: composer-attachment-spin 0.8s linear infinite;
}

.composer-attachment__retry {
  height: 20px;
  padding: 0 8px;
  border-radius: 7px;
  border: 1px solid rgba(248, 113, 113, 0.38);
  background: rgba(248, 113, 113, 0.12);
  color: #fecaca;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.composer-attachment__retry:hover {
  background: rgba(248, 113, 113, 0.22);
}

.composer-attachment__error {
  margin: 0;
  font-size: 11px;
  color: #fca5a5;
  line-height: 1.35;
  max-width: 100%;
  overflow-wrap: anywhere;
}

.composer-attachment__remove {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.14);
  color: #fca5a5;
  cursor: pointer;
  display: grid;
  place-items: center;
  font-size: 12px;
}

.composer-attachment__remove:hover {
  background: rgba(239, 68, 68, 0.24);
}

@keyframes composer-attachment-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1023px) {
  .composer-attachments {
    grid-template-columns: 1fr;
  }
}
</style>
