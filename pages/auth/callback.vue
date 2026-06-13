<script setup lang="ts">
import AuthAlert from '~/components/auth/Alert.vue'
import AuthShell from '~/components/auth/Shell.vue'
import { processEmailChangeAuthCallback } from '@/src/services/auth/http'
import {
  clearAuthCallbackUrl,
  getSingleQueryParam,
  parseEmailChangeAuthCallback,
} from '@/src/utils/authCallback'
import { AUTH_REDIRECT_FLOW_PARAM } from '@/src/utils/authRedirectState'
import { devError, devLog } from '@/src/utils/safeLogger'
import { useAuthStore } from '~/stores/auth'

const route = useRoute()
const auth = useAuthStore()

const verifying = ref(true)
const error = ref('')
const awaitingOtherConfirmation = ref(false)

useHead({
  title: 'Kergit | E-posta değişikliğini doğrula',
})

onMounted(async () => {
  if (typeof window === 'undefined') return

  const authFlow = getSingleQueryParam(route.query[AUTH_REDIRECT_FLOW_PARAM])
  const parsedCallback = parseEmailChangeAuthCallback(new URL(window.location.href))

  // Remove one-time credentials from browser history before making the request.
  clearAuthCallbackUrl()

  if (authFlow !== 'email-change') {
    error.value = 'Bu bağlantı geçerli bir e-posta değişikliği doğrulaması değil.'
    verifying.value = false
    return
  }

  if (!parsedCallback.ok) {
    error.value = parsedCallback.message
    verifying.value = false
    return
  }

  if (parsedCallback.kind === 'confirmation-accepted') {
    devLog('[email-change-callback] first confirmation accepted')
    awaitingOtherConfirmation.value = true
    verifying.value = false
    return
  }

  try {
    const session = await processEmailChangeAuthCallback(parsedCallback.payload)
    auth.setSession(session)
    auth.setReady(true)

    devLog('[email-change-callback] email change completed')
    await navigateTo('/app?email_change=success', { replace: true })
  } catch (callbackError: unknown) {
    devError('[email-change-callback] confirmation processing failed')
    error.value = callbackError instanceof Error
      ? callbackError.message
      : 'E-posta değişikliği doğrulanamadı. Bağlantının süresi dolmuş veya daha önce kullanılmış olabilir.'
    verifying.value = false
  }
})
</script>

<template>
  <AuthShell
    eyebrow="E-posta Değişikliği"
    title="E-posta adresini doğrula"
    description="Supabase doğrulama bağlantısı güvenli oturumuna uygulanıyor."
    back-to="/app"
    back-label="Uygulamaya dön"
    preview-variant="login"
    :show-preview="false"
  >
    <div v-if="verifying" class="auth-view auth-view--centered">
      <p class="auth-view__eyebrow">Bağlantı Doğrulanıyor</p>
      <h2 class="auth-view__title">E-posta değişikliği işleniyor</h2>
      <p class="auth-view__description">
        Oturumun ve güvenli çerezlerin yenileniyor. Lütfen birkaç saniye bekle.
      </p>
      <div class="auth-view__spinner" aria-hidden="true" />
    </div>

    <div v-else-if="awaitingOtherConfirmation" class="auth-view">
      <p class="auth-view__eyebrow">İlk Doğrulama Tamamlandı</p>
      <h2 class="auth-view__title">Diğer bağlantıyı da aç</h2>
      <p class="auth-view__description">
        Güvenli e-posta değişikliğini tamamlamak için diğer e-posta adresine gönderilen bağlantıyı da doğrula.
      </p>

      <AuthAlert tone="success" title="Bir doğrulama kaldı">
        İki bağlantı tamamlandıktan sonra yeni e-posta adresin geçerli olacak.
      </AuthAlert>

      <NuxtLink to="/app" class="auth-standalone-link">
        Uygulamaya dön
      </NuxtLink>
    </div>

    <div v-else class="auth-view">
      <p class="auth-view__eyebrow">Doğrulama Başarısız</p>
      <h2 class="auth-view__title">Bağlantı işlenemedi</h2>
      <p class="auth-view__description">
        Hesap ayarlarından yeni bir e-posta değişikliği isteği başlatman gerekebilir.
      </p>

      <AuthAlert tone="error">
        {{ error }}
      </AuthAlert>

      <NuxtLink to="/app" class="auth-standalone-link">
        Uygulamaya dön
      </NuxtLink>
    </div>
  </AuthShell>
</template>

<style scoped>
.auth-view {
  display: grid;
  gap: 1.15rem;
}

.auth-view--centered {
  justify-items: center;
  text-align: center;
}

.auth-view__eyebrow {
  margin: 0;
  color: #22d3ee;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.auth-view__title {
  margin: 0;
  color: #f8fbff;
  font-family: 'Space Grotesk', 'Manrope', sans-serif;
  font-size: clamp(1.7rem, 3vw, 2.2rem);
  font-weight: 700;
  letter-spacing: -0.05em;
}

.auth-view__description {
  margin: 0;
  color: rgba(186, 195, 223, 0.8);
  line-height: 1.75;
}

.auth-view__spinner {
  width: 2.4rem;
  height: 2.4rem;
  border: 3px solid rgba(34, 211, 238, 0.2);
  border-top-color: #22d3ee;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
