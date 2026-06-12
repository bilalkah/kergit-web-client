<script setup lang="ts">
import { ChatLinkPreviewCardVariant, type ChatMessageLinkPreview } from '@/src/features/messages/types'

const props = withDefaults(defineProps<{
  preview?: ChatMessageLinkPreview | null
  variant?: ChatLinkPreviewCardVariant
  loading?: boolean
  errorMessage?: string
  clearable?: boolean
}>(), {
  preview: null,
  variant: ChatLinkPreviewCardVariant.Message,
  loading: false,
  errorMessage: '',
  clearable: false,
})

defineEmits<{
  (event: 'clear'): void
}>()

const variantClass = {
  [ChatLinkPreviewCardVariant.Message]: 'chat-link-preview--message',
  [ChatLinkPreviewCardVariant.Composer]: 'chat-link-preview--composer',
}
</script>

<template>
  <section
    v-if="props.loading || props.preview || props.errorMessage"
    class="chat-link-preview"
    :class="variantClass[props.variant]"
  >
    <div v-if="props.loading && !props.preview" class="chat-link-preview__loading">
      <span class="chat-link-preview__spinner" aria-hidden="true"></span>
      <span>Baglanti onizlemesi aliniyor...</span>
    </div>

    <article v-else-if="props.preview" class="chat-link-preview__card">
      <a
        class="chat-link-preview__link"
        :href="props.preview.url"
        target="_blank"
        rel="noopener noreferrer"
      >
        <img
          v-if="props.preview.imageUrl && props.variant === ChatLinkPreviewCardVariant.Composer"
          class="chat-link-preview__image"
          :src="props.preview.imageUrl"
          :alt="props.preview.title || props.preview.siteName || 'Baglanti onizlemesi'"
          loading="lazy"
          decoding="async"
        />
        <div class="chat-link-preview__body">
          <p class="chat-link-preview__title">{{ props.preview.title || props.preview.url }}</p>
          <p v-if="props.preview.description" class="chat-link-preview__description">
            {{ props.preview.description }}
          </p>
          <p class="chat-link-preview__meta">{{ props.preview.siteName || props.preview.url }}</p>
        </div>
      </a>

      <button
        v-if="props.clearable"
        class="chat-link-preview__clear"
        type="button"
        aria-label="Onizlemeyi kaldir"
        @click="$emit('clear')"
      >
        x
      </button>
    </article>

    <p v-if="props.errorMessage && !props.preview" class="chat-link-preview__error">
      {{ props.errorMessage }}
    </p>
  </section>
</template>

<style scoped>
.chat-link-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat-link-preview--message {
  margin-top: 10px;
}

.chat-link-preview--composer {
  margin-bottom: 8px;
}

.chat-link-preview__loading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #9aa5bd;
}

.chat-link-preview__spinner {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 2px solid rgba(148, 163, 184, 0.3);
  border-top-color: rgba(34, 211, 238, 0.85);
  animation: chat-link-preview-spin 0.8s linear infinite;
}

.chat-link-preview__card {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: start;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 10px;
  overflow: hidden;
  background: rgba(15, 23, 42, 0.42);
  color: inherit;
}

.chat-link-preview--message .chat-link-preview__card {
  grid-template-columns: 1fr;
}

.chat-link-preview__link {
  min-width: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: stretch;
  text-decoration: none;
  color: inherit;
}

.chat-link-preview__link:focus-visible {
  outline: 1px solid rgba(34, 211, 238, 0.5);
  outline-offset: -1px;
}

.chat-link-preview--message .chat-link-preview__link {
  grid-template-columns: 1fr;
}

.chat-link-preview__image {
  width: 100%;
  max-width: 72px;
  height: 72px;
  object-fit: cover;
  display: block;
}

.chat-link-preview--message .chat-link-preview__image {
  max-width: 100%;
  max-height: 220px;
  height: auto;
}

.chat-link-preview__body {
  min-width: 0;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chat-link-preview__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-link-preview__description {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: #b6c2d8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-link-preview__meta {
  margin: 0;
  font-size: 11px;
  color: #8f9cb5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-link-preview__clear {
  width: 24px;
  height: 24px;
  margin: 6px;
  border: none;
  border-radius: 7px;
  background: rgba(239, 68, 68, 0.14);
  color: #fca5a5;
  cursor: pointer;
}

.chat-link-preview__clear:hover {
  background: rgba(239, 68, 68, 0.24);
}

.chat-link-preview__error {
  margin: 0;
  font-size: 11px;
  color: #a2aec4;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.34);
}

@keyframes chat-link-preview-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
