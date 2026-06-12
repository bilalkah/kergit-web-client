<script setup lang="ts">
const props = withDefaults(defineProps<{
  title: string
  collapsed?: boolean
  showAddIcon?: boolean
  addIconLabel?: string
}>(), {
  collapsed: false,
  showAddIcon: false,
  addIconLabel: 'Kanal oluştur',
})

const emit = defineEmits<{
  toggle: []
  create: []
}>()

function onCreateClick() {
  if (!props.showAddIcon) return
  emit('create')
}
</script>

<template>
  <button class="sidebar-section-header" type="button" @click="emit('toggle')">
    <span class="sidebar-section-chevron" :class="{ collapsed: props.collapsed }" aria-hidden="true">
      <svg viewBox="0 0 12 12" fill="none">
        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
    </span>
    <span class="sidebar-section-title">{{ props.title }}</span>
    <span
      class="sidebar-section-add"
      :class="{ 'is-disabled': !props.showAddIcon }"
      :aria-label="props.showAddIcon ? props.addIconLabel : undefined"
      :aria-hidden="props.showAddIcon ? 'false' : 'true'"
      @click.stop="onCreateClick"
    >+</span>
  </button>
</template>

<style scoped>
.sidebar-section-header {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 16px 16px 8px 16px;
  width: 100%;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.sidebar-section-header:hover .sidebar-section-title {
  color: #93a8da;
}

.sidebar-section-chevron {
  width: 12px;
  height: 12px;
  color: #6b7da8;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transform: rotate(0deg);
  transition: transform 0.2s ease;
}

.sidebar-section-chevron svg {
  width: 10px;
  height: 10px;
  display: block;
}

.sidebar-section-chevron.collapsed {
  transform: rotate(-90deg);
}

.sidebar-section-title {
  font-family: 'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.12em;
  color: #6b7da8;
  text-transform: uppercase;
}

.sidebar-section-add {
  margin-left: auto;
  width: 18px;
  height: 18px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(152, 167, 201, 0.85);
  font-size: 14px;
  line-height: 1;
  opacity: 0;
  pointer-events: none;
  transform: translateY(1px);
  transition: opacity 0.18s ease, transform 0.18s ease, color 0.18s ease, background 0.18s ease;
}

.sidebar-section-header:hover .sidebar-section-add:not(.is-disabled),
.sidebar-section-header:focus-visible .sidebar-section-add:not(.is-disabled) {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.sidebar-section-add.is-disabled {
  opacity: 0;
  pointer-events: none;
}

.sidebar-section-add:hover {
  color: #d5def7;
  background: rgba(255, 255, 255, 0.08);
}

.sidebar-section-header:focus-visible {
  outline: 1px solid rgba(99, 102, 241, 0.55);
  outline-offset: -2px;
  border-radius: 8px;
}
</style>
