<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder: string
  disabled?: boolean
}>(), {
  disabled: false,
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'send'): void
  (event: 'focus'): void
  (event: 'blur'): void
  (event: 'paste', value: ClipboardEvent): void
}>()

const inputRef = ref<HTMLTextAreaElement | null>(null)

const resizeInput = () => {
  const element = inputRef.value
  if (!element) return
  element.style.height = '0'
  const nextHeight = Math.min(Math.max(element.scrollHeight, 26), 150)
  element.style.height = `${nextHeight}px`
}

const onInput = (event: Event) => {
  const target = event.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
  resizeInput()
}

const onKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  emit('send')
}

watch(
  () => props.modelValue,
  async () => {
    await nextTick()
    resizeInput()
  }
)

onMounted(() => {
  resizeInput()
})
</script>

<template>
  <textarea
    ref="inputRef"
    class="message-composer-input"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    rows="1"
    @input="onInput"
    @keydown="onKeydown"
    @focus="$emit('focus')"
    @blur="$emit('blur')"
    @paste="$emit('paste', $event)"
  />
</template>

<style scoped>
.message-composer-input {
  width: 100%;
  min-height: 26px;
  max-height: 150px;
  resize: none;
  overflow-y: auto;
  border: none;
  outline: none;
  background: transparent;
  color: #eef3ff;
  font-size: 14px;
  line-height: 1.45;
  font-family: var(--ui-font-sans);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.message-composer-input::placeholder {
  color: #6e7a90;
}
</style>
