<script setup lang="ts">
import { computed } from 'vue'
import {
  parseMessageRichContent,
  RichMessageNodeType,
  type RichMessageNode,
} from '@/src/features/messages/richText'
import {
  type ChatMessageAttachmentSignedUrlResolver,
  ChatMessageImageBehavior,
  ChatMessageRenderMode,
  type ChatMessageAttachment,
  type ChatMessageLinkPreview,
} from '@/src/features/messages/types'
import ChatMessageAttachmentList from '~/components/ui/messages/ChatMessageAttachmentList.vue'
import ChatMessageLinkPreviewCard from '~/components/ui/messages/ChatMessageLinkPreview.vue'

const props = withDefaults(defineProps<{
  channelId: string
  content: string
  mode?: ChatMessageRenderMode
  imageBehavior?: ChatMessageImageBehavior
  own?: boolean
  attachments?: ChatMessageAttachment[]
  linkPreview?: ChatMessageLinkPreview | null
  resolveAttachmentSignedUrl: ChatMessageAttachmentSignedUrlResolver
}>(), {
  mode: ChatMessageRenderMode.RichAuto,
  imageBehavior: ChatMessageImageBehavior.InlinePreviewWithLink,
  own: false,
  attachments: () => [],
  linkPreview: null,
})

const renderedNodes = computed<RichMessageNode[]>(() => {
  if (props.mode === ChatMessageRenderMode.Plain) {
    return [
      {
        type: RichMessageNodeType.Text,
        text: props.content ?? '',
      },
    ]
  }
  return parseMessageRichContent(props.content ?? '')
})

const shouldInlineImage = computed(() =>
  props.imageBehavior === ChatMessageImageBehavior.InlinePreviewWithLink,
)
const nodeType = RichMessageNodeType
</script>

<template>
  <div class="chat-message-content" :class="{ 'chat-message-content--own': own }">
    <template v-for="(node, index) in renderedNodes" :key="`node-${index}`">
      <span v-if="node.type === nodeType.Text" class="chat-message-content__text">{{ node.text }}</span>

      <a
        v-else-if="node.type === nodeType.Link"
        class="chat-message-content__link"
        :href="node.url"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ node.label }}
      </a>

      <template v-else-if="shouldInlineImage">
        <figure class="chat-message-content__image-figure">
          <a
            class="chat-message-content__image-link"
            :href="node.url"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              class="chat-message-content__image"
              :src="node.url"
              :alt="node.alt"
              loading="lazy"
              decoding="async"
            />
          </a>
          <figcaption class="chat-message-content__image-caption">
            <a :href="node.url" target="_blank" rel="noopener noreferrer">{{ node.url }}</a>
          </figcaption>
        </figure>
      </template>

      <a
        v-else
        class="chat-message-content__link"
        :href="node.url"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ node.url }}
      </a>
    </template>
    <ChatMessageAttachmentList
      :channel-id="channelId"
      :attachments="attachments"
      :resolve-signed-url="resolveAttachmentSignedUrl"
    />
    <ChatMessageLinkPreviewCard v-if="linkPreview" :preview="linkPreview" />
  </div>
</template>

<style scoped>
.chat-message-content {
  color: inherit;
  width: 100%;
  min-width: 0;
  max-width: 100%;
}

.chat-message-content__text {
  color: inherit;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.chat-message-content__link {
  color: #67e8f9;
  font-weight: 500;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.chat-message-content__link:hover {
  color: #a5f3fc;
}

.chat-message-content--own .chat-message-content__link {
  color: #7dd3fc;
}

.chat-message-content--own .chat-message-content__link:hover {
  color: #bae6fd;
}

.chat-message-content__image-figure {
  margin: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 100%;
  min-width: 0;
}

.chat-message-content__image-link {
  display: inline-flex;
  align-items: flex-start;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.chat-message-content__image {
  display: block;
  width: 100%;
  max-width: 100%;
  max-height: 320px;
  height: auto;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  object-fit: contain;
  background: rgba(2, 6, 23, 0.45);
}

.chat-message-content__image-caption {
  margin: 0;
  font-size: 11px;
  line-height: 1.35;
  opacity: 0.82;
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.chat-message-content__image-caption a {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  overflow-wrap: anywhere;
  word-break: break-word;
}

@media (max-width: 1023px) {
  .chat-message-content__image {
    max-height: 240px;
  }
}
</style>
