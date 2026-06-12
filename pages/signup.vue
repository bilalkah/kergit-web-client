<script setup lang="ts">
import { computed, ref } from 'vue'
import AuthAlert from '~/components/auth/Alert.vue'
import AuthButton from '~/components/auth/Button.vue'
import AuthField from '~/components/auth/Field.vue'
import AuthShell from '~/components/auth/Shell.vue'
import { useSupabase } from '@/composables/useSupabase'
import { signUpWithLegalRecords } from '@/src/services/auth/signup'
import { clearPendingAuthRedirectState, issueAuthRedirectUrl } from '@/src/utils/authRedirectState'
import { toAuthErrorMessage } from '@/src/utils/authErrors'
import { getPasswordValidationError } from '@/src/utils/password'
import { DUPLICATE_USERNAME_MESSAGE, getUsernameValidationError } from '@/src/utils/username'
import { devWarn } from '@/src/utils/safeLogger'

const username = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')

// No avatar picker on signup; profiles seed with the default avatar.
const DEFAULT_AVATAR_SEED = 'Caleb'

const loading = ref(false)
const error = ref<string | null>(null)
const success = ref(false)
const submittedEmail = ref<string | null>(null)
const capsLockPasswordOn = ref(false)
const capsLockConfirmOn = ref(false)

const showCapsLockWarning = computed(() =>
  capsLockPasswordOn.value || capsLockConfirmOn.value
)

function updateCapsLockPassword(event: KeyboardEvent) {
  capsLockPasswordOn.value = event.getModifierState('CapsLock')
}

function updateCapsLockConfirm(event: KeyboardEvent) {
  capsLockConfirmOn.value = event.getModifierState('CapsLock')
}

function clearCapsLockPassword() {
  capsLockPasswordOn.value = false
}

function clearCapsLockConfirm() {
  capsLockConfirmOn.value = false
}

useHead({
  title: 'Kergit | Kayıt ol',
})

async function onSubmit() {
  error.value = null

  const normalizedUsername = username.value.trim()
  const normalizedEmail = email.value.trim()

  if (!normalizedUsername) {
    error.value = 'Kullanıcı adı zorunlu.'
    return
  }

  const usernameError = getUsernameValidationError(normalizedUsername)
  if (usernameError) {
    error.value = usernameError
    return
  }

  if (!normalizedEmail) {
    error.value = 'E-posta adresi zorunlu.'
    return
  }

  const passwordError = getPasswordValidationError(password.value)
  if (passwordError) {
    error.value = passwordError
    return
  }

  if (password.value !== confirmPassword.value) {
    error.value = 'Şifreler eşleşmiyor'
    return
  }

  loading.value = true

  try {
    // Block reuse of emails reserved by deleted accounts before hitting Supabase.
    // Active duplicate email handling stays Supabase Auth's responsibility.
    try {
      await $fetch('/api/auth/signup-precheck', {
        method: 'POST',
        body: { email: normalizedEmail, username: normalizedUsername },
      })
    } catch (precheckError: unknown) {
      const status = (precheckError as { statusCode?: number; status?: number })?.statusCode
        ?? (precheckError as { status?: number })?.status
      if (status === 409) {
        const body = (precheckError as { data?: { reason?: string; data?: { reason?: string } } })?.data
        const reason = body?.data?.reason ?? body?.reason
        error.value = reason === 'username_taken'
          ? DUPLICATE_USERNAME_MESSAGE
          : 'Bu e-posta adresi kullanılamıyor.'
        loading.value = false
        return
      }
      throw precheckError
    }

    const emailRedirectTo = issueAuthRedirectUrl('/login', 'signup-verification')
    const supabase = useSupabase()

    const { data: signUpData, error: signUpError } = await signUpWithLegalRecords(supabase, {
      email: normalizedEmail,
      password: password.value,
      username: normalizedUsername,
      avatarSeed: DEFAULT_AVATAR_SEED,
      emailRedirectTo,
    })

    if (signUpError) {
      throw signUpError
    }

    const hasSession = Boolean(signUpData?.session?.access_token)
    const hasConfirmationSentAt = Boolean(signUpData?.user?.confirmation_sent_at)
    const hasConfirmedEmail = Boolean(
      signUpData?.user?.email_confirmed_at ?? signUpData?.user?.confirmed_at
    )

    if (!hasSession && !hasConfirmationSentAt && !hasConfirmedEmail) {
      devWarn('[signup] unexpected signUp response payload', {
        hasUser: Boolean(signUpData?.user),
        hasSession: Boolean(signUpData?.session),
      })
      throw new Error('Kayıt isteği doğrulanamadı. Lütfen tekrar dene.')
    }

    submittedEmail.value = normalizedEmail
    success.value = true
  } catch (e: unknown) {
    clearPendingAuthRedirectState('signup-verification')
    error.value = toAuthErrorMessage(e, 'signup')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthShell
    eyebrow="Beta Kaydı"
    title="Topluluğa katıl"
    description="Hesabını oluştur, doğrulamanı tamamla ve performans odaklı iletişim deneyimine doğrudan geç."
    back-to="/"
    back-label="Ana sayfaya dön"
    preview-variant="signup"
    :show-preview="false"
  >
    <template v-if="!success">
      <div class="auth-view">
        <p class="auth-view__eyebrow">Hesap Oluştur</p>
        <h2 class="auth-view__title">Yeni bir hesap başlat</h2>
        <p class="auth-view__description">
          Beta erişimi için temel bilgilerini gir. Doğrulama bağlantısını aynı tarayıcıda aç.
        </p>

        <form class="auth-form" @submit.prevent="onSubmit">
          <AuthField
            id="signup-username"
            v-model="username"
            label="Kullanıcı adı"
            placeholder="Benzersiz bir kullanıcı adı seç"
            autocomplete="username"
            required
          />

          <AuthField
            id="signup-email"
            v-model="email"
            type="email"
            label="E-posta"
            placeholder="user@example.com"
            autocomplete="email"
            required
          />

          <AuthField
            id="signup-password"
            v-model="password"
            type="password"
            label="Şifre"
            placeholder="Güçlü bir şifre oluştur"
            autocomplete="new-password"
            required
            @keydown="updateCapsLockPassword"
            @keyup="updateCapsLockPassword"
            @blur="clearCapsLockPassword"
          />

          <AuthField
            id="signup-password-confirm"
            v-model="confirmPassword"
            type="password"
            label="Şifre tekrar"
            placeholder="Şifreni yeniden gir"
            autocomplete="new-password"
            required
            @keydown="updateCapsLockConfirm"
            @keyup="updateCapsLockConfirm"
            @blur="clearCapsLockConfirm"
          />

          <p v-if="showCapsLockWarning" class="auth-caps-lock">Büyük harf kilidi açık.</p>

          <AuthButton
            type="submit"
            :loading="loading"
          >
            Hesap Oluştur
          </AuthButton>

          <p class="auth-legal-notice">
            “Hesap Oluştur” butonuna tıklayarak 18 yaş ve üzerinde olduğunu beyan eder,
            Kergit’in <NuxtLink to="/terms" class="auth-inline-link">Kullanıcı Sözleşmesi</NuxtLink>’ni kabul etmiş ve
            <NuxtLink to="/privacy" class="auth-inline-link">Gizlilik Politikası / KVKK Aydınlatma Metni</NuxtLink>’ni okuduğunu kabul etmiş olursun.
          </p>

          <AuthAlert v-if="error" tone="error">
            {{ error }}
          </AuthAlert>
        </form>

        <p class="auth-view__footer">
          Zaten hesabın var mı?
          <NuxtLink to="/login" class="auth-inline-link">
            Giriş yap
          </NuxtLink>
        </p>
      </div>
    </template>

    <template v-else>
      <div class="auth-view">
        <p class="auth-view__eyebrow">Doğrulama Gönderildi</p>
        <h2 class="auth-view__title">E-postanı kontrol et</h2>
        <p class="auth-view__description">
          Doğrulama bağlantısını aşağıdaki adrese gönderdik. Aynı tarayıcıda açarsan giriş akışı otomatik tamamlanır.
        </p>

        <AuthAlert tone="success" title="Bağlantı gönderildi">
          <strong class="auth-highlight">{{ submittedEmail }}</strong>
        </AuthAlert>

        <p class="auth-view__note">
          E-posta gelmezse spam klasörünü kontrol et veya birkaç dakika sonra tekrar dene.
        </p>

        <NuxtLink to="/login" class="auth-standalone-link">
          Giriş ekranına geç
        </NuxtLink>
      </div>
    </template>
  </AuthShell>
</template>

<style scoped>
.auth-view {
  position: relative;
  display: grid;
  gap: 1.15rem;
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
.auth-view__note,
.auth-view__footer {
  margin: 0;
  color: rgba(186, 195, 223, 0.8);
  line-height: 1.75;
}

.auth-view__note {
  font-size: 0.94rem;
}

.auth-form {
  display: grid;
  gap: 1rem;
}

.auth-inline-link,
.auth-standalone-link {
  color: #7dd3fc;
  font-weight: 600;
  transition: color 180ms ease;
}

.auth-inline-link:hover,
.auth-standalone-link:hover {
  color: #c4b5fd;
}

.auth-highlight {
  color: #f8fbff;
}

.auth-standalone-link {
  display: inline-flex;
  width: fit-content;
}

.auth-caps-lock {
  margin: -0.25rem 0 0;
  color: #fbbf24;
  font-size: 0.86rem;
  font-weight: 600;
  line-height: 1.4;
}

.auth-legal-notice {
  margin: -0.15rem 0 0;
  color: rgba(186, 195, 223, 0.78);
  font-size: 0.82rem;
  line-height: 1.7;
}
</style>
