<script setup lang="ts">
import AuthAlert from '~/components/auth/Alert.vue'
import AuthButton from '~/components/auth/Button.vue'
import AuthField from '~/components/auth/Field.vue'
import AuthShell from '~/components/auth/Shell.vue'
import { exchangeCallbackSession, updateCurrentPassword } from '@/src/services/auth/http'
import { AUTH_REDIRECT_FLOW_PARAM, AUTH_REDIRECT_STATE_PARAM, consumePendingAuthRedirectState } from '@/src/utils/authRedirectState'
import { clearAuthCallbackUrl, getSingleQueryParam } from '@/src/utils/authCallback'
import { getPasswordValidationError } from '@/src/utils/password'
import { devError, devLog, devWarn } from '@/src/utils/safeLogger'

const route = useRoute()

const newPassword = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const success = ref(false)
const sessionReady = ref(false)
const verifying = ref(true)

function getRecoveryStateErrorMessage() {
  return 'Kurtarma bağlantısı, şifre sıfırlama isteğinin yapıldığı aynı tarayıcıda açılmalıdır.'
}

useHead({
  title: 'Kergit | Şifre sıfırla',
})

async function onUpdatePassword() {
  devLog('[reset-password] update password clicked')

  error.value = null
  loading.value = true

  if (newPassword.value !== confirmPassword.value) {
    error.value = 'Şifreler eşleşmiyor'
    loading.value = false
    return
  }

  const passwordError = getPasswordValidationError(newPassword.value)
  if (passwordError) {
    error.value = passwordError
    loading.value = false
    return
  }

  try {
    await updateCurrentPassword({
      password: newPassword.value,
    })

    devLog('[reset-password] password updated successfully')
    success.value = true

    if (typeof window !== 'undefined') {
      clearAuthCallbackUrl()
    }
  } catch (e: unknown) {
    devError('[reset-password] failed:', e)
    error.value = e instanceof Error ? e.message : 'Şifre güncellenemedi'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  if (typeof window === 'undefined') return

  const hash = window.location.hash
  const params = new URLSearchParams(hash.substring(1))

  const hashError = params.get('error')
  const errorDescription = params.get('error_description')
  if (hashError) {
    devError('[reset-password] Supabase error in URL:', hashError, errorDescription)
    error.value = errorDescription?.replace(/\+/g, ' ') || 'Kurtarma bağlantısı geçersiz veya süresi dolmuş'
    clearAuthCallbackUrl()
    verifying.value = false
    return
  }

  const tokenType = params.get('type')

  if (hash && tokenType === 'recovery') {
    devLog('[reset-password] detected recovery token in URL')

    const authFlow = getSingleQueryParam(route.query[AUTH_REDIRECT_FLOW_PARAM])
    const authState = getSingleQueryParam(route.query[AUTH_REDIRECT_STATE_PARAM])

    if (authFlow !== 'password-recovery') {
      devWarn('[reset-password] rejected recovery link due to unexpected auth flow:', authFlow ?? 'missing')
      error.value = getRecoveryStateErrorMessage()
      clearAuthCallbackUrl()
      verifying.value = false
      return
    }

    const stateValidation = consumePendingAuthRedirectState('password-recovery', authState)
    if (!stateValidation.ok) {
      devWarn('[reset-password] rejected recovery link due to auth state validation:', stateValidation.reason)
      error.value = getRecoveryStateErrorMessage()
      clearAuthCallbackUrl()
      verifying.value = false
      return
    }

    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    if (accessToken && refreshToken) {
      try {
        await exchangeCallbackSession({
          accessToken,
          refreshToken,
        })

        clearAuthCallbackUrl()

        devLog('[reset-password] session set, ready for password update')
        sessionReady.value = true
        verifying.value = false
      } catch (e) {
        devError('[reset-password] failed to set session:', e)
        error.value = 'Kurtarma bağlantısı işlenemedi'
        verifying.value = false
      }
    } else {
      error.value = 'Geçersiz kurtarma bağlantısı'
      clearAuthCallbackUrl()
      verifying.value = false
    }
  } else if (hash) {
    devWarn('[reset-password] unexpected auth token type in URL:', tokenType ?? 'missing')
    error.value = 'Geçersiz kurtarma bağlantısı'
    clearAuthCallbackUrl()
    verifying.value = false
  } else {
    devWarn('[reset-password] no recovery token in URL, redirecting to forgot password')
    await navigateTo('/login?forgot=true', { replace: true })
  }
})
</script>

<template>
  <AuthShell
    eyebrow="Şifre Kurtarma"
    title="Erişimini güvenle yenile"
    description="Doğrulanmış kurtarma bağlantın hazırsa yeni şifreni burada güncelleyebilirsin."
    back-to="/login?forgot=true"
    back-label="Girişe dön"
    preview-variant="reset"
  >
    <template v-if="verifying">
      <div class="auth-view auth-view--centered">
        <p class="auth-view__eyebrow">Bağlantı Doğrulanıyor</p>
        <h2 class="auth-view__title">Kurtarma bağlantısı kontrol ediliyor</h2>
        <p class="auth-view__description">
          Lütfen birkaç saniye bekle. Tek kullanımlık bağlantın doğrulanıyor.
        </p>
        <div class="auth-view__spinner" aria-hidden="true" />
      </div>
    </template>

    <template v-else-if="error && !sessionReady">
      <div class="auth-view">
        <p class="auth-view__eyebrow">Bağlantı Geçersiz</p>
        <h2 class="auth-view__title">Kurtarma bağlantısı kullanılamadı</h2>
        <p class="auth-view__description">
          Yeni bir sıfırlama bağlantısı isteyip akışı yeniden başlatman gerekiyor.
        </p>

        <AuthAlert tone="error">
          {{ error }}
        </AuthAlert>

        <NuxtLink to="/login?forgot=true" class="auth-standalone-link">
          Yeni bağlantı iste
        </NuxtLink>
      </div>
    </template>

    <template v-else-if="sessionReady && !success">
      <div class="auth-view">
        <p class="auth-view__eyebrow">Yeni Şifre</p>
        <h2 class="auth-view__title">Şifreni güncelle</h2>
        <p class="auth-view__description">
          Güçlü bir şifre belirle. Değişiklik tamamlandığında giriş akışına dönebilirsin.
        </p>

        <form novalidate class="auth-form" @submit.prevent="onUpdatePassword">
          <AuthField
            id="reset-password-new"
            v-model="newPassword"
            type="password"
            label="Yeni şifre"
            placeholder="Yeni şifreni gir"
            autocomplete="new-password"
          />

          <AuthField
            id="reset-password-confirm"
            v-model="confirmPassword"
            type="password"
            label="Şifre tekrar"
            placeholder="Şifreni yeniden gir"
            autocomplete="new-password"
          />

          <AuthButton type="submit" :loading="loading">
            Şifreyi güncelle
          </AuthButton>

          <AuthAlert v-if="error" tone="error">
            {{ error }}
          </AuthAlert>
        </form>
      </div>
    </template>

    <template v-else-if="success">
      <div class="auth-view">
        <p class="auth-view__eyebrow">Güncelleme Tamamlandı</p>
        <h2 class="auth-view__title">Şifren başarıyla güncellendi</h2>
        <p class="auth-view__description">
          Artık yeni şifrenle giriş yapabilirsin.
        </p>

        <AuthAlert tone="success" title="Hazırsın">
          Hesabın yeni parolanla kullanılabilir durumda.
        </AuthAlert>

        <NuxtLink to="/login" class="auth-standalone-link">
          Giriş yap
        </NuxtLink>
      </div>
    </template>
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

.auth-form {
  display: grid;
  gap: 1rem;
}

.auth-view__spinner {
  width: 2.5rem;
  height: 2.5rem;
  margin-top: 0.4rem;
  border: 2px solid rgba(125, 146, 202, 0.2);
  border-top-color: #8b5cf6;
  border-radius: 999px;
  animation: resetSpin 820ms linear infinite;
}

.auth-standalone-link {
  display: inline-flex;
  width: fit-content;
  color: #7dd3fc;
  font-weight: 600;
  transition: color 180ms ease;
}

.auth-standalone-link:hover {
  color: #c4b5fd;
}

@keyframes resetSpin {
  to {
    transform: rotate(360deg);
  }
}
</style>
