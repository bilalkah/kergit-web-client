import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

type FloatingCardPosition = {
  x: number
  y: number
}

type FloatingMemberCardProps = {
  userId: string
  hubId?: string | null
  position: FloatingCardPosition
}

type FloatingMemberCardCallbacks = {
  close: () => void
}

type FloatingMemberCardOptions = {
  defaultWidth?: number
  defaultHeight?: number
  margin?: number
}

export function useFloatingMemberCard(
  props: FloatingMemberCardProps,
  callbacks: FloatingMemberCardCallbacks,
  options: FloatingMemberCardOptions = {},
) {
  const cardEl = ref<HTMLElement | null>(null)
  const leftPx = ref(0)
  const topPx = ref(0)

  const cardMargin = options.margin ?? 12
  const defaultCardWidth = options.defaultWidth ?? 320
  const defaultCardHeight = options.defaultHeight ?? 260

  const positionStyle = computed(() => ({
    left: `${leftPx.value}px`,
    top: `${topPx.value}px`,
  }))

  function clampCardPosition() {
    if (!import.meta.client) return
    const width = cardEl.value?.offsetWidth ?? defaultCardWidth
    const height = cardEl.value?.offsetHeight ?? defaultCardHeight
    const preferredLeft = props.position.x + 10
    const preferredTop = props.position.y + 10

    leftPx.value = Math.max(cardMargin, Math.min(preferredLeft, window.innerWidth - width - cardMargin))
    topPx.value = Math.max(cardMargin, Math.min(preferredTop, window.innerHeight - height - cardMargin))
  }

  function onDocumentPointerDown(event: PointerEvent) {
    const target = event.target as Node | null
    if (!cardEl.value || !target) return
    if (cardEl.value.contains(target)) return
    callbacks.close()
  }

  function onDocumentKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      callbacks.close()
    }
  }

  onMounted(() => {
    if (!import.meta.client) return
    document.addEventListener('pointerdown', onDocumentPointerDown, true)
    document.addEventListener('keydown', onDocumentKeyDown)
    window.addEventListener('resize', clampCardPosition)
  })

  onBeforeUnmount(() => {
    if (!import.meta.client) return
    document.removeEventListener('pointerdown', onDocumentPointerDown, true)
    document.removeEventListener('keydown', onDocumentKeyDown)
    window.removeEventListener('resize', clampCardPosition)
  })

  return {
    cardEl,
    positionStyle,
    clampCardPosition,
  }
}
