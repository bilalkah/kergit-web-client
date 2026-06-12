<script setup lang="ts">
import { computed } from 'vue'
import ChatMessageContent from '~/components/ui/messages/ChatMessageContent.vue'
import {
  ChatMessageImageBehavior,
  ChatMessageRenderMode,
} from '@/src/features/messages/types'
import type {
  ChatMessageAttachmentSignedUrlResolver,
  ChatMessageBubbleModel,
  ChatMessageRenderConfig,
} from '@/src/features/messages/types'

type ChatMessageRenderConfigOverrides = Partial<ChatMessageRenderConfig>

const props = defineProps<{
  channelId: string
  message: ChatMessageBubbleModel
  config?: ChatMessageRenderConfigOverrides
  resolveAttachmentSignedUrl: ChatMessageAttachmentSignedUrlResolver
}>()

const DEFAULT_CONFIG: ChatMessageRenderConfig = {
  renderMode: ChatMessageRenderMode.RichAuto,
  imageBehavior: ChatMessageImageBehavior.LinkOnly,
}

const resolvedConfig = computed<ChatMessageRenderConfig>(() => ({
  ...DEFAULT_CONFIG,
  ...(props.config ?? {}),
}))

const renderMode = computed<ChatMessageRenderMode>(() => resolvedConfig.value.renderMode)
const imageBehavior = computed<ChatMessageImageBehavior>(() => resolvedConfig.value.imageBehavior)
</script>

<template>
  <article
    class="chat-message-bubble"
    :class="{
      'chat-message-bubble--own': message.own,
    }"
  >
    <div class="chat-message-bubble__content">
      <ChatMessageContent
        :channel-id="channelId"
        :content="message.content"
        :mode="renderMode"
        :image-behavior="imageBehavior"
        :own="message.own"
        :attachments="message.attachments ?? []"
        :link-preview="message.linkPreview ?? null"
        :resolve-attachment-signed-url="resolveAttachmentSignedUrl"
      />
    </div>
  </article>
</template>

<style scoped>
.chat-message-bubble {
  display: inline-flex;
  flex: 0 0 auto;
  width: auto;
  min-width: 0;
  max-width: min(70%, 720px);
  padding: 10px 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: #c4ccd8;
  box-sizing: border-box;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: break-word;
}

.chat-message-bubble--own {
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.35), rgba(109, 40, 217, 0.25));
  border-color: rgba(124, 58, 237, 0.3);
  color: #e2d9f3;
}

.chat-message-bubble__content {
  width: 100%;
  min-width: 0;
  max-width: 100%;
}

@media (max-width: 1023px) {
  .chat-message-bubble {
    max-width: 84%;
  }
}
</style>
