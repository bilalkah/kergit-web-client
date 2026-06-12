<script setup lang="ts">
import AuthAlert from '~/components/auth/Alert.vue'
import AuthButton from '~/components/auth/Button.vue'
import AuthField from '~/components/auth/Field.vue'
import AuthShell from '~/components/auth/Shell.vue'
import Tooltip from '~/components/ui/Tooltip.vue'
import { useSupabase } from '@/composables/useSupabase'
import { useAuthStore } from '~/stores/auth'
import { SocketState, useWebSocket } from '~/composables/useWebSocket'
import { exchangeCallbackSession, loginWithPassword } from '@/src/services/auth/http'
import {
  AUTH_REDIRECT_FLOW_PARAM,
  AUTH_REDIRECT_STATE_PARAM,
  clearPendingAuthRedirectState,
  consumePendingAuthRedirectState,
  issueAuthRedirectUrl,
} from '@/src/utils/authRedirectState'
import { clearAuthCallbackUrl, getSingleQueryParam } from '@/src/utils/authCallback'
import { toAuthErrorMessage } from '@/src/utils/authErrors'
import { devError, devLog, devWarn } from '@/src/utils/safeLogger'

const email = ref('')
const password = ref('')

const loading = ref(false)
const error = ref<string | null>(null)

const showForgotPassword = ref(false)
const forgotEmail = ref('')
const forgotLoading = ref(false)
const forgotError = ref<string | null>(null)
const forgotSuccess = ref(false)

const auth = useAuthStore()
const socket = useWebSocket()
const route = useRoute()

const VERIFICATION_TOKEN_TYPES = new Set(['signup', 'email'])

function getVerificationStateErrorMessage() {
  return 'Doğrulama bağlantısı, hesabın oluşturulduğu aynı tarayıcıda açılmalıdır.'
}

const socketErrorMessage = () => {
  const last = socket.lastClose.value
  if (last) {
    const reason = last.reason || 'bilinmeyen_neden'
    return `Sunucu bağlantısı kapandı (${last.code}): ${reason}`
  }
  return 'Sunuculara erişirken sorun yaşıyoruz. Lütfen tekrar deneyin.'
}

function waitForSocketOpen(timeoutMs: number): Promise<void> {
  if (socket.state.value === SocketState.LOADING || socket.state.value === SocketState.READY) {
    return Promise.resolve()
  }
  if (socket.state.value === SocketState.ERROR) {
    const reason = socket.lastClose.value?.reason ?? 'socket_error'
    devWarn('[login] socket error:', reason)
    return Promise.reject(new Error(socketErrorMessage()))
  }

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error(socketErrorMessage()))
      return
    }

    let stop: (() => void) | null = null
    let timeoutId: number | null = null

    const cleanup = () => {
      if (stop) {
        stop()
        stop = null
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
        timeoutId = null
      }
    }

    timeoutId = window.setTimeout(() => {
      cleanup()
      reject(new Error(socketErrorMessage()))
    }, timeoutMs)

    stop = watch(
      () => socket.state.value,
      (val) => {
        if (val === SocketState.LOADING || val === SocketState.READY) {
          cleanup()
          resolve()
        } else if (val === SocketState.ERROR) {
          const reason = socket.lastClose.value?.reason ?? 'socket_error'
          cleanup()
          devWarn('[login] socket error:', reason)
          reject(new Error(socketErrorMessage()))
        }
      },
      { immediate: true },
    )
  })
}

useHead({
  title: 'Kergit | Giriş yap',
})

async function onSubmit() {
  devLog('[login] submit clicked')

  error.value = null

  const normalizedEmail = email.value.trim()
  if (!normalizedEmail) {
    error.value = 'E-posta adresi zorunlu.'
    return
  }
  if (!password.value) {
    error.value = 'Şifre zorunlu.'
    return
  }

  loading.value = true

  try {
    const authSession = await loginWithPassword({
      email: normalizedEmail,
      password: password.value,
    })

    devLog('[login] login success')

    auth.setSession(authSession)
    auth.setReady(true)

    const connectPromise = socket.connect({ timeoutMs: 15000 })
    connectPromise.catch((err) => {
      devWarn('[login] socket auth failed', err)
    })

    await waitForSocketOpen(8000)
    await navigateTo('/app')
  } catch (e: unknown) {
    devError('[login] login failed:', e)

    socket.disconnect()
    auth.clearAuth()
    auth.setReady(true)

    error.value = toAuthErrorMessage(e, 'login')
  } finally {
    loading.value = false
    devLog('[login] loading reset')
  }
}

async function onForgotPassword() {
  devLog('[forgot-password] submit clicked')

  forgotError.value = null
  forgotSuccess.value = false

  const normalizedEmail = forgotEmail.value.trim()
  if (!normalizedEmail) {
    forgotError.value = 'E-posta adresi zorunlu.'
    return
  }

  forgotLoading.value = true

  try {
    const redirectTo = issueAuthRedirectUrl('/reset-password', 'password-recovery')
    const supabase = useSupabase()

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      normalizedEmail,
      {
        redirectTo,
      },
    )

    if (resetError) {
      devError('[forgot-password] supabase error:', resetError.message)
      throw resetError
    }

    devLog('[forgot-password] reset email sent')
    forgotSuccess.value = true
  } catch (e: unknown) {
    clearPendingAuthRedirectState('password-recovery')
    devError('[forgot-password] failed:', e)
    forgotError.value = toAuthErrorMessage(e, 'forgot-password')
  } finally {
    forgotLoading.value = false
  }
}

function backToLogin() {
  showForgotPassword.value = false
  forgotError.value = null
  forgotSuccess.value = false
  forgotEmail.value = ''
}

const autoLoginLoading = ref(false)
const autoLoginError = ref<string | null>(null)
const capsLockOn = ref(false)

function updateCapsLockState(event: KeyboardEvent) {
  capsLockOn.value = event.getModifierState('CapsLock')
}

function clearCapsLockState() {
  capsLockOn.value = false
}

onMounted(async () => {
  if (typeof window === 'undefined') return

  if (route.query.forgot === 'true') {
    showForgotPassword.value = true
    clearAuthCallbackUrl()
  }

  const hash = window.location.hash
  if (!hash) return

  const params = new URLSearchParams(hash.substring(1))

  const hashError = params.get('error')
  const errorDescription = params.get('error_description')
  if (hashError) {
    devError('[login] Supabase error in URL:', hashError, errorDescription)
    const descriptionText = errorDescription?.replace(/\+/g, ' ')
    autoLoginError.value = toAuthErrorMessage(new Error(descriptionText || hashError), 'verify-email')
    clearAuthCallbackUrl()
    return
  }

  const tokenType = params.get('type')

  if (tokenType && VERIFICATION_TOKEN_TYPES.has(tokenType)) {
    devLog('[login] detected email verification token in URL')

    autoLoginLoading.value = true

    const authFlow = getSingleQueryParam(route.query[AUTH_REDIRECT_FLOW_PARAM])
    const authState = getSingleQueryParam(route.query[AUTH_REDIRECT_STATE_PARAM])

    if (authFlow !== 'signup-verification') {
      devWarn('[login] rejected verification link due to unexpected auth flow:', authFlow ?? 'missing')
      autoLoginError.value = getVerificationStateErrorMessage()
      autoLoginLoading.value = false
      clearAuthCallbackUrl()
      return
    }

    const stateValidation = consumePendingAuthRedirectState('signup-verification', authState)
    if (!stateValidation.ok) {
      devWarn('[login] rejected verification link due to auth state validation:', stateValidation.reason)
      autoLoginError.value = getVerificationStateErrorMessage()
      autoLoginLoading.value = false
      clearAuthCallbackUrl()
      return
    }

    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    if (accessToken && refreshToken) {
      try {
        const authSession = await exchangeCallbackSession({
          accessToken,
          refreshToken,
        })

        devLog('[login] session restored from verification link')

        clearAuthCallbackUrl()

        devLog('[login] auto-login success')

        auth.setSession(authSession)
        auth.setReady(true)

        const connectPromise = socket.connect({ timeoutMs: 15000 })
        connectPromise.catch((err) => {
          devWarn('[login] socket auth failed', err)
        })

        await waitForSocketOpen(8000)
        await navigateTo('/app')
      } catch (e: unknown) {
        devError('[login] auto-login failed:', e)
        autoLoginError.value = toAuthErrorMessage(e, 'verify-email')
        autoLoginLoading.value = false
      }
    } else {
      autoLoginError.value = 'Geçersiz doğrulama bağlantısı'
      autoLoginLoading.value = false
      clearAuthCallbackUrl()
    }
  } else if (tokenType) {
    devWarn('[login] unexpected auth token type in URL:', tokenType)
    autoLoginError.value = 'Geçersiz doğrulama bağlantısı'
    clearAuthCallbackUrl()
  }
})
</script>

<template>
  <AuthShell
    eyebrow="Giriş"
    title="Tekrar hoş geldin"
    description="Düşük gecikmeli kanallarına dön, topluluğunla bağlantıyı kesmeden devam et."
    back-to="/"
    back-label="Ana sayfaya dön"
    preview-variant="login"
    :show-preview="false"
  >
    <template v-if="autoLoginLoading">
      <div class="auth-view auth-view--centered">
        <p class="auth-view__eyebrow">E-posta Doğrulama</p>
        <h2 class="auth-view__title">E-postan doğrulanıyor</h2>
        <p class="auth-view__description">
          Oturumun hazırlanıyor. Lütfen birkaç saniye bekle.
        </p>
        <div class="auth-view__spinner" aria-hidden="true" />
      </div>
    </template>

    <template v-else-if="autoLoginError">
      <div class="auth-view">
        <p class="auth-view__eyebrow">Doğrulama Başarısız</p>
        <h2 class="auth-view__title">Bağlantı doğrulanamadı</h2>
        <p class="auth-view__description">
          İstersen manuel giriş yapabilir veya yeni bir doğrulama e-postası talep edebilirsin.
        </p>

        <AuthAlert tone="error">
          {{ autoLoginError }}
        </AuthAlert>

        <AuthButton type="button" tone="secondary" @click="autoLoginError = null">
          Giriş ekranına devam et
        </AuthButton>
      </div>
    </template>

    <template v-else-if="!showForgotPassword">
      <div class="auth-view">
        <p class="auth-view__eyebrow">Oturum Aç</p>
        <h2 class="auth-view__title">Hesabına giriş yap</h2>
        <p class="auth-view__description">
          Kimlik doğrulaman tamamlandığında uygulamaya doğrudan yönlendirilirsin.
        </p>

        <form novalidate class="auth-form" @submit.prevent="onSubmit">
          <AuthField
            id="login-email"
            v-model="email"
            type="email"
            label="E-posta"
            placeholder="user@example.com"
            autocomplete="email"
          />

          <div class="auth-password-wrap">
            <Tooltip content="Büyük harf kilidi açık." placement="bottom" :visible="capsLockOn" full-width>
              <AuthField
                id="login-password"
                v-model="password"
                type="password"
                label="Şifre"
                placeholder="Şifreni gir"
                autocomplete="current-password"
                @keydown="updateCapsLockState"
                @keyup="updateCapsLockState"
                @blur="clearCapsLockState"
              />
            </Tooltip>

            <button
              type="button"
              class="auth-inline-link auth-inline-link--forgot"
              @click="showForgotPassword = true"
            >
              Şifremi unuttum
            </button>
          </div>

          <AuthButton type="submit" :loading="loading">
            Giriş yap
          </AuthButton>

          <AuthAlert v-if="error" tone="error">
            {{ error }}
          </AuthAlert>
        </form>

        <p class="auth-view__footer">
          Hesabın yok mu?
          <NuxtLink to="/signup" class="auth-inline-link">
            Kayıt ol
          </NuxtLink>
        </p>
      </div>
    </template>

    <template v-else>
      <div class="auth-view">
        <p class="auth-view__eyebrow">Şifre Sıfırlama</p>
        <h2 class="auth-view__title">Sıfırlama bağlantısı al</h2>
        <p class="auth-view__description">
          Şifreni yenilemek için e-posta adresini gir. Bağlantıyı aynı tarayıcıda aç.
        </p>

        <form v-if="!forgotSuccess" novalidate class="auth-form" @submit.prevent="onForgotPassword">
          <AuthField
            id="forgot-email"
            v-model="forgotEmail"
            type="email"
            label="E-posta"
            placeholder="user@example.com"
            autocomplete="email"
          />

          <AuthButton type="submit" :loading="forgotLoading">
            Sıfırlama bağlantısı gönder
          </AuthButton>

          <AuthAlert v-if="forgotError" tone="error">
            {{ forgotError }}
          </AuthAlert>
        </form>

        <AuthAlert v-else tone="success" title="Bağlantı gönderildi">
          E-postanı kontrol et. Görmüyorsan spam klasörüne de bak.
        </AuthAlert>

        <button type="button" class="auth-inline-link auth-inline-link--back" @click="backToLogin">
          ← Girişe dön
        </button>
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

.auth-view__description,
.auth-view__footer {
  margin: 0;
  color: rgba(186, 195, 223, 0.8);
  line-height: 1.75;
}

.auth-form {
  display: grid;
  gap: 1rem;
}

.auth-password-wrap {
  position: relative;
}

.auth-password-wrap :deep(.ui-tooltip-anchor-full > *) {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
}

.auth-inline-link {
  color: #7dd3fc;
  font-weight: 600;
  transition: color 180ms ease;
}

.auth-inline-link:hover {
  color: #c4b5fd;
}

.auth-inline-link--forgot {
  position: absolute;
  top: 0;
  right: 0;
  font-size: 0.9rem;
}

.auth-inline-link--back {
  width: fit-content;
}

.auth-view__spinner {
  width: 2.5rem;
  height: 2.5rem;
  margin-top: 0.4rem;
  border: 2px solid rgba(125, 146, 202, 0.2);
  border-top-color: #8b5cf6;
  border-radius: 999px;
  animation: loginSpin 820ms linear infinite;
}

@keyframes loginSpin {
  to {
    transform: rotate(360deg);
  }
}
</style>
