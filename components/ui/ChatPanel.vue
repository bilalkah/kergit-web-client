<script setup lang="ts">
import TopBar from '~/components/ui/TopBar.vue'
import InputBar from '~/components/ui/InputBar.vue'
import TypingIndicator from '~/components/ui/TypingIndicator.vue'

const props = withDefaults(
  defineProps<{
    showTopbar?: boolean
    /**
     * Hide the input bar when true. This is passed by the layout
     * when a voice call is active so the video grid can occupy the
     * full panel height.
     */
    hideInput?: boolean
    /**
     * Hide the typing indicator when true. Otherwise an empty row
     * remains at the bottom of the panel.
     */
    hideTyping?: boolean
  }>(),
  {
    showTopbar: true,
    hideInput: false,
    hideTyping: false,
  }
)
</script>

<template>
  <section class="ui-chat-panel">
    <header v-if="props.showTopbar" class="ui-chat-topbar">
      <TopBar />
    </header>

    <main class="ui-chat-content">
      <div class="ui-chat-main">
        <slot />
      </div>
      <!-- hide typing indicator when voice grid is active -->
      <TypingIndicator v-if="!props.hideTyping" class="ui-chat-typing-gap" />
    </main>

    <!-- hide input bar when voice grid is active -->
    <footer v-if="!props.hideInput" class="ui-chat-input">
      <InputBar />
    </footer>
  </section>
</template>

<style scoped>
/* Allow the slot content (e.g., VoiceGrid) to fill the panel */
.ui-chat-content {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.ui-chat-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ui-chat-main > * {
  flex: 1 1 auto;
  min-height: 0;
}

.ui-chat-typing-gap {
  align-self: stretch;
}
</style>
