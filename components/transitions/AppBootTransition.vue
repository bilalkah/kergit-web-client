<script setup lang="ts">
type BootTransitionVariant = 'boot' | 'logout'

const BOOT_VARIANT: BootTransitionVariant = 'boot'
const LOGOUT_VARIANT: BootTransitionVariant = 'logout'

const props = withDefaults(defineProps<{
  visible: boolean
  variant?: BootTransitionVariant
  status?: string
  durationMs?: number
  title?: string
  subtitle?: string
  showLoader?: boolean
}>(), {
  variant: BOOT_VARIANT,
  status: '',
  durationMs: 300,
  title: '',
  subtitle: '',
  showLoader: true,
})

const transitionStyle = computed(() => ({
  '--boot-transition-duration': `${props.durationMs}ms`,
}))

const resolvedTitle = computed(() => {
  const title = props.title.trim()
  if (title.length > 0) return title
  return props.variant === LOGOUT_VARIANT ? 'Görüşürüz' : 'Kergit'
})

const resolvedSubtitle = computed(() => {
  const subtitle = props.subtitle.trim()
  if (subtitle.length > 0) return subtitle
  return props.variant === LOGOUT_VARIANT
    ? 'Güvenli çıkış yapılıyor'
    : 'Gerçek zamanlı iletişim'
})

const normalizedStatus = computed(() => props.status.trim())
const shouldShowStatus = computed(() =>
  props.variant !== LOGOUT_VARIANT && normalizedStatus.value.length > 0,
)
</script>

<template>
  <Transition name="app-boot-overlay" appear>
    <div v-if="props.visible" class="boot-screen" :style="transitionStyle"
      :class="{ 'boot-screen--logout': props.variant === LOGOUT_VARIANT }">
      <div class="boot-content">
        <div class="boot-logo" :class="{ 'boot-logo--logout': props.variant === LOGOUT_VARIANT }">
          <svg v-if="props.variant === BOOT_VARIANT" class="boot-icon" viewBox="0 0 24 24" fill="none"
            xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"
              stroke-linejoin="round" />
            <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"
              stroke-linejoin="round" />
            <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"
              stroke-linejoin="round" />
          </svg>

          <svg v-else class="boot-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round" />
            <polyline points="16,17 21,12 16,7" stroke="currentColor" stroke-width="2" stroke-linecap="round"
              stroke-linejoin="round" />
            <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"
              stroke-linejoin="round" />
          </svg>
        </div>

        <h1 class="boot-title">{{ resolvedTitle }}</h1>
        <p class="boot-subtitle">{{ resolvedSubtitle }}</p>

        <div v-if="props.showLoader" class="boot-loader">
          <div class="boot-loader-bar"></div>
        </div>

        <p v-if="shouldShowStatus" class="boot-status">{{ normalizedStatus }}</p>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.boot-screen {
  position: fixed;
  inset: 0;
  min-height: 100dvh;
  z-index: 100;
  display: grid;
  place-items: center;
  background: radial-gradient(ellipse at 20% 0%, #312e81 0%, #0f172a 50%, #020617 100%);
  color: #f8fafc;
}

.boot-screen--logout {
  background: radial-gradient(ellipse at 20% 0%, #4c1d95 0%, #0f172a 50%, #020617 100%);
}

.boot-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  animation: boot-content-fade-in 0.3s ease-out;
}

.boot-logo {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  border-radius: 20px;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.1),
    0 20px 40px -10px rgba(99, 102, 241, 0.4),
    0 0 60px -20px rgba(99, 102, 241, 0.6);
}

.boot-logo--logout {
  background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
}

.boot-icon {
  width: 40px;
  height: 40px;
  color: #ffffff;
}

.boot-title {
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0;
}

.boot-subtitle {
  font-size: 0.875rem;
  color: #64748b;
  margin: 0;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.boot-loader {
  width: 200px;
  height: 3px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 24px;
}

.boot-loader-bar {
  height: 100%;
  width: 40%;
  background: linear-gradient(90deg, #6366f1, #818cf8, #6366f1);
  border-radius: 2px;
  animation: boot-loader-slide 1.2s ease-in-out infinite;
}

.boot-status {
  font-size: 0.8125rem;
  color: #475569;
  margin: 8px 0 0;
}

.app-boot-overlay-enter-active,
.app-boot-overlay-leave-active {
  transition:
    opacity var(--boot-transition-duration, 300ms) ease,
    transform var(--boot-transition-duration, 300ms) ease;
}

.app-boot-overlay-enter-from {
  opacity: 0;
  transform: scale(1.02);
}

.app-boot-overlay-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

@keyframes boot-content-fade-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes boot-loader-slide {
  0% {
    transform: translateX(-100%);
  }

  100% {
    transform: translateX(350%);
  }
}
</style>
