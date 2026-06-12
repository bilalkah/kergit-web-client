<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    icon?: string
    title: string
    message: string
    actionText?: string
    compact?: boolean
  }>(),
  {
    icon: '',
    actionText: '',
    compact: false,
  }
)

const emit = defineEmits<{
  action: []
}>()
</script>

<template>
  <div class="ui-empty-state" :class="{ compact: props.compact }" role="status" aria-live="polite">
    <div v-if="props.icon" class="ui-empty-icon" aria-hidden="true">{{ props.icon }}</div>
    <h3 class="ui-empty-title">{{ props.title }}</h3>
    <p class="ui-empty-message">{{ props.message }}</p>
    <button
      v-if="props.actionText"
      class="ui-empty-action"
      type="button"
      @click="emit('action')"
    >
      {{ props.actionText }}
    </button>
  </div>
</template>

<style scoped>
.ui-empty-state {
  width: min(460px, 100%);
  margin: 0 auto;
  display: grid;
  justify-items: center;
  gap: 8px;
  text-align: center;
  padding: 16px;
  color: #cbd5e1;
}

.ui-empty-state.compact {
  padding: 8px 12px;
}

.ui-empty-icon {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-size: 20px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.ui-empty-title {
  margin: 0;
  color: #f2f7ff;
  font-size: 18px;
  font-weight: 700;
}

.ui-empty-message {
  margin: 0;
  color: rgba(148, 163, 184, 0.92);
  font-size: 13px;
  line-height: 1.45;
}

.ui-empty-action {
  margin-top: 4px;
  border: 0;
  border-radius: 10px;
  padding: 8px 12px;
  background: rgba(124, 58, 237, 0.32);
  color: #efe7ff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.ui-empty-action:hover {
  background: rgba(124, 58, 237, 0.42);
}
</style>
