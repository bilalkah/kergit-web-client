<script setup lang="ts">
defineOptions({
  inheritAttrs: false,
})

type TooltipPlacement = 'top' | 'right' | 'bottom' | 'left'

const props = withDefaults(defineProps<{
  content: string
  placement?: TooltipPlacement
  toggleOnClick?: boolean
  fullWidth?: boolean
  disabled?: boolean
  showOnTouch?: boolean
  visible?: boolean
}>(), {
  placement: 'top',
  toggleOnClick: false,
  fullWidth: false,
  disabled: false,
  showOnTouch: false,
  visible: undefined,
})

const anchorRef = ref<HTMLElement | null>(null)
const attrs = useAttrs()
const tooltipVisible = ref(false)
const tooltipPosition = ref({ top: 0, left: 0 })
const isCoarsePointer = ref(false)
let mediaQuery: MediaQueryList | null = null

const normalizedContent = computed(() => props.content?.trim() ?? '')
const canRenderTooltip = computed(() => !props.disabled && normalizedContent.value.length > 0)
const isControlled = computed(() => typeof props.visible === 'boolean')
const canShowByHoverOrFocus = computed(() =>
  canRenderTooltip.value && (!isCoarsePointer.value || props.showOnTouch)
)
const isTooltipShown = computed(() => {
  if (!canRenderTooltip.value) return false
  if (isControlled.value) return props.visible === true
  return tooltipVisible.value
})

function syncPointerMode() {
  if (!import.meta.client || !mediaQuery) return
  isCoarsePointer.value = mediaQuery.matches
}

function updateTooltipPosition() {
  if (!anchorRef.value) return
  const rect = anchorRef.value.getBoundingClientRect()

  if (props.placement === 'top') {
    tooltipPosition.value = {
      top: Math.round(rect.top - 8),
      left: Math.round(rect.left + rect.width / 2),
    }
    return
  }

  if (props.placement === 'right') {
    tooltipPosition.value = {
      top: Math.round(rect.top + rect.height / 2),
      left: Math.round(rect.right + 10),
    }
    return
  }

  if (props.placement === 'bottom') {
    tooltipPosition.value = {
      top: Math.round(rect.bottom + 8),
      left: Math.round(rect.left + rect.width / 2),
    }
    return
  }

  tooltipPosition.value = {
    top: Math.round(rect.top + rect.height / 2),
    left: Math.round(rect.left - 10),
  }
}

function openTooltip() {
  if (isControlled.value) return
  if (!canShowByHoverOrFocus.value) return
  tooltipVisible.value = true
  updateTooltipPosition()
}

function closeTooltip() {
  if (isControlled.value) return
  tooltipVisible.value = false
}

function onMouseEnter() {
  openTooltip()
}

function onMouseLeave() {
  closeTooltip()
}

function onFocusIn() {
  openTooltip()
}

function onFocusOut(event: FocusEvent) {
  const nextTarget = event.relatedTarget as Node | null
  if (!anchorRef.value) {
    closeTooltip()
    return
  }
  if (nextTarget && anchorRef.value.contains(nextTarget)) return
  closeTooltip()
}

function onAnchorClick() {
  if (isControlled.value) return
  if (!props.toggleOnClick || !canRenderTooltip.value) return
  tooltipVisible.value = !tooltipVisible.value
  if (tooltipVisible.value) {
    updateTooltipPosition()
  }
}

function onGlobalPositionChange() {
  if (!isTooltipShown.value) return
  updateTooltipPosition()
}

function onDocumentPointerDown(event: MouseEvent | TouchEvent) {
  if (isControlled.value) return
  if (!props.toggleOnClick || !tooltipVisible.value || !anchorRef.value) return
  const target = event.target as Node | null
  if (target && anchorRef.value.contains(target)) return
  closeTooltip()
}

watch(canRenderTooltip, (available) => {
  if (!available) closeTooltip()
})

watch(() => props.visible, (visible) => {
  if (!import.meta.client) return
  if (!isControlled.value || visible !== true) return
  nextTick(() => {
    if (isTooltipShown.value) {
      updateTooltipPosition()
    }
  })
})

watch(isTooltipShown, (visible) => {
  if (!import.meta.client) return
  if (visible) {
    window.addEventListener('resize', onGlobalPositionChange)
    window.addEventListener('scroll', onGlobalPositionChange, true)
    document.addEventListener('mousedown', onDocumentPointerDown, true)
    document.addEventListener('touchstart', onDocumentPointerDown, true)
    nextTick(() => {
      if (isTooltipShown.value) {
        updateTooltipPosition()
      }
    })
    return
  }
  window.removeEventListener('resize', onGlobalPositionChange)
  window.removeEventListener('scroll', onGlobalPositionChange, true)
  document.removeEventListener('mousedown', onDocumentPointerDown, true)
  document.removeEventListener('touchstart', onDocumentPointerDown, true)
})

onMounted(() => {
  if (!import.meta.client) return
  mediaQuery = window.matchMedia('(hover: none), (pointer: coarse)')
  syncPointerMode()
  mediaQuery.addEventListener('change', syncPointerMode)
})

onBeforeUnmount(() => {
  if (import.meta.client) {
    window.removeEventListener('resize', onGlobalPositionChange)
    window.removeEventListener('scroll', onGlobalPositionChange, true)
    document.removeEventListener('mousedown', onDocumentPointerDown, true)
    document.removeEventListener('touchstart', onDocumentPointerDown, true)
  }
  if (mediaQuery) {
    mediaQuery.removeEventListener('change', syncPointerMode)
  }
})
</script>

<template>
  <span
    ref="anchorRef"
    v-bind="attrs"
    class="ui-tooltip-anchor"
    :class="{ 'ui-tooltip-anchor-full': props.fullWidth }"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
    @focusin="onFocusIn"
    @focusout="onFocusOut"
    @click="onAnchorClick"
  >
    <slot />
  </span>

  <Teleport to="body">
    <Transition name="ui-tooltip">
      <div
        v-if="isTooltipShown"
        class="ui-tooltip-floating"
        :data-placement="props.placement"
        :style="{ top: `${tooltipPosition.top}px`, left: `${tooltipPosition.left}px` }"
        role="tooltip"
      >
        {{ normalizedContent }}
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ui-tooltip-anchor {
  display: inline-flex;
  max-width: 100%;
}

.ui-tooltip-anchor-full {
  display: flex;
  width: 100%;
}

.ui-tooltip-floating {
  position: fixed;
  background: rgba(31, 35, 48, 0.98);
  color: #e5e7eb;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: 0 10px 24px rgba(2, 6, 23, 0.45);
  pointer-events: none;
  white-space: nowrap;
  z-index: 9999;
  will-change: transform, opacity;
}

.ui-tooltip-floating[data-placement='top'] {
  transform: translate(-50%, -100%);
}

.ui-tooltip-floating[data-placement='right'] {
  transform: translate(0, -50%);
}

.ui-tooltip-floating[data-placement='bottom'] {
  transform: translate(-50%, 0);
}

.ui-tooltip-floating[data-placement='left'] {
  transform: translate(-100%, -50%);
}

.ui-tooltip-floating::after {
  content: '';
  position: absolute;
  border: 6px solid transparent;
}

.ui-tooltip-floating[data-placement='top']::after {
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-top-color: rgba(31, 35, 48, 0.98);
}

.ui-tooltip-floating[data-placement='right']::after {
  right: 100%;
  top: 50%;
  transform: translateY(-50%);
  border-right-color: rgba(31, 35, 48, 0.98);
}

.ui-tooltip-floating[data-placement='bottom']::after {
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-bottom-color: rgba(31, 35, 48, 0.98);
}

.ui-tooltip-floating[data-placement='left']::after {
  left: 100%;
  top: 50%;
  transform: translateY(-50%);
  border-left-color: rgba(31, 35, 48, 0.98);
}

.ui-tooltip-enter-active,
.ui-tooltip-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.ui-tooltip-enter-from[data-placement='top'],
.ui-tooltip-leave-to[data-placement='top'] {
  opacity: 0;
  transform: translate(-50%, calc(-100% + 6px)) scale(0.98);
}

.ui-tooltip-enter-from[data-placement='right'],
.ui-tooltip-leave-to[data-placement='right'] {
  opacity: 0;
  transform: translate(-6px, -50%) scale(0.98);
}

.ui-tooltip-enter-from[data-placement='bottom'],
.ui-tooltip-leave-to[data-placement='bottom'] {
  opacity: 0;
  transform: translate(-50%, -6px) scale(0.98);
}

.ui-tooltip-enter-from[data-placement='left'],
.ui-tooltip-leave-to[data-placement='left'] {
  opacity: 0;
  transform: translate(calc(-100% + 6px), -50%) scale(0.98);
}
</style>
