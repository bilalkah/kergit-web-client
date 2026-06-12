<script setup lang="ts">
defineOptions({
  inheritAttrs: false,
})

withDefaults(defineProps<{
  modelValue: string
  id: string
  label: string
  type?: string
  placeholder?: string
  autocomplete?: string
  required?: boolean
  disabled?: boolean
}>(), {
  type: 'text',
  placeholder: '',
  autocomplete: undefined,
  required: false,
  disabled: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const attrs = useAttrs()
</script>

<template>
  <label class="auth-field" :for="id">
    <span class="auth-field__label">{{ label }}</span>
    <input
      v-bind="attrs"
      :id="id"
      :value="modelValue"
      :type="type"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :required="required"
      :disabled="disabled"
      class="auth-field__input"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </label>
</template>

<style scoped>
.auth-field {
  display: grid;
  gap: 0.7rem;
}

.auth-field__label {
  color: rgba(226, 232, 250, 0.86);
  font-size: 0.92rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.auth-field__input {
  width: 100%;
  border: 1px solid rgba(125, 146, 202, 0.14);
  border-radius: 16px;
  background:
    linear-gradient(180deg, rgba(10, 15, 38, 0.92), rgba(8, 12, 31, 0.88));
  padding: 0.95rem 1rem;
  color: #f8fbff;
  font-size: 0.96rem;
  line-height: 1.4;
  outline: none;
  transition:
    border-color 220ms ease,
    box-shadow 220ms ease,
    transform 220ms ease;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.auth-field__input::placeholder {
  color: rgba(125, 146, 202, 0.56);
}

.auth-field__input:hover {
  border-color: rgba(96, 165, 250, 0.24);
}

.auth-field__input:focus {
  border-color: rgba(34, 211, 238, 0.52);
  box-shadow:
    0 0 0 4px rgba(34, 211, 238, 0.08),
    0 10px 28px -18px rgba(34, 211, 238, 0.4);
  transform: translateY(-1px);
}

.auth-field__input:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
</style>
