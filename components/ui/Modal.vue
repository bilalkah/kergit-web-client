<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  title?: string
  showBack?: boolean
  dismissible?: boolean
}>(), {
  title: '',
  showBack: false,
  dismissible: true,
})

const emit = defineEmits<{
  'update:modelValue': [boolean]
  back: []
}>()

const modalContentRef = ref<HTMLElement | null>(null)
let previousActiveElement: HTMLElement | null = null

function close() {
  if (!props.dismissible) return
  emit('update:modelValue', false)
}

function goBack() {
  if (!props.dismissible) return
  emit('back')
}

function getFocusableElements(): HTMLElement[] {
  const root = modalContentRef.value
  if (!root) return []
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ')
  return Array.from(root.querySelectorAll<HTMLElement>(selector))
}

function focusFirstElement() {
  const focusables = getFocusableElements()
  const firstFocusable = focusables[0]
  if (firstFocusable) {
    firstFocusable.focus()
    return
  }
  modalContentRef.value?.focus()
}

function onKeydown(event: KeyboardEvent) {
  if (!props.modelValue) return
  if (event.key === 'Escape') {
    close()
    return
  }
  if (event.key !== 'Tab') return
  const focusables = getFocusableElements()
  if (focusables.length === 0) {
    event.preventDefault()
    modalContentRef.value?.focus()
    return
  }
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  if (!first || !last) return
  const current = document.activeElement as HTMLElement | null

  if (event.shiftKey && current === first) {
    event.preventDefault()
    last.focus()
    return
  }
  if (!event.shiftKey && current === last) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(() => {
  if (!import.meta.client) return
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  if (!import.meta.client) return
  window.removeEventListener('keydown', onKeydown)
})

watch(
  () => props.modelValue,
  async (open) => {
    if (!import.meta.client) return
    if (open) {
      previousActiveElement = document.activeElement as HTMLElement | null
      await nextTick()
      focusFirstElement()
      return
    }
    previousActiveElement?.focus?.()
  },
  { flush: 'post' }
)
</script>

<template>
  <Teleport to="body">
    <Transition name="ui-modal-fade" appear>
      <div
        v-if="props.modelValue"
        class="ui-modal-overlay"
        @click.self="close"
      >
        <div
          ref="modalContentRef"
          class="ui-modal-content"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="props.title ? 'ui-modal-title' : undefined"
          :aria-label="props.title || 'Pencere'"
          tabindex="-1"
        >
          <header class="ui-modal-header">
            <button
              v-if="props.showBack"
              type="button"
              class="ui-modal-back"
              aria-label="Geri"
              :disabled="!props.dismissible"
              @click="goBack"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M12.5 4.5L7 10l5.5 5.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" />
              </svg>
              <span>Geri</span>
            </button>
            <span v-else class="ui-modal-spacer" aria-hidden="true"></span>

            <h2 id="ui-modal-title" class="ui-modal-title">{{ props.title }}</h2>

            <button
              type="button"
              class="ui-modal-close"
              aria-label="Kapat"
              :disabled="!props.dismissible"
              @click="close"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M5 5L15 15M15 5L5 15" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8" />
              </svg>
            </button>
          </header>

          <section class="ui-modal-body">
            <slot />
          </section>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ui-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  padding: 20px;
  display: grid;
  place-items: center;
  background: rgba(2, 6, 23, 0.62);
  backdrop-filter: blur(4px);
}

.ui-modal-fade-enter-active,
.ui-modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.ui-modal-fade-enter-from,
.ui-modal-fade-leave-to {
  opacity: 0;
}

.ui-modal-content {
  width: min(500px, calc(100vw - 40px));
  max-height: min(90vh, 760px);
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: #0d1020;
  box-shadow: 0 22px 46px rgba(2, 6, 23, 0.45);
  overflow: hidden;
  transform: translateY(0) scale(1);
  transition: transform 0.22s ease;
}

.ui-modal-fade-enter-from .ui-modal-content,
.ui-modal-fade-leave-to .ui-modal-content {
  transform: translateY(8px) scale(0.98);
}

.ui-modal-header {
  position: sticky;
  top: 0;
  z-index: 1;
  height: 56px;
  padding: 0 12px;
  display: grid;
  grid-template-columns: max-content 1fr max-content;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(13, 16, 32, 0.96);
}

.ui-modal-title {
  margin: 0;
  color: #eef4ff;
  font-size: 15px;
  font-weight: 700;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ui-modal-back,
.ui-modal-close {
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: #8892a4;
  transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease;
  cursor: pointer;
}

.ui-modal-back:hover,
.ui-modal-close:hover {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
  color: #eef4ff;
}

.ui-modal-back:disabled,
.ui-modal-close:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ui-modal-back {
  height: 32px;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 600;
}

.ui-modal-back svg,
.ui-modal-close svg {
  width: 14px;
  height: 14px;
}

.ui-modal-close {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  display: grid;
  place-items: center;
}

.ui-modal-spacer {
  width: 32px;
  height: 32px;
}

.ui-modal-body {
  flex: 1;
  min-height: 0;
  padding: 16px;
  overflow-y: auto;
}

@media (max-width: 1023px) {
  .ui-modal-overlay {
    padding: 12px;
  }

  .ui-modal-content {
    width: min(500px, calc(100vw - 24px));
    max-height: calc(100dvh - 24px);
  }
}
</style>
