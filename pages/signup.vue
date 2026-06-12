<script setup lang="ts">
import AuthAlert from '~/components/auth/Alert.vue'
import AuthButton from '~/components/auth/Button.vue'
import AuthField from '~/components/auth/Field.vue'
import AuthLegalModal from '~/components/auth/LegalModal.vue'
import AuthShell from '~/components/auth/Shell.vue'
import { useSupabase } from '@/composables/useSupabase'
import { clearPendingAuthRedirectState, issueAuthRedirectUrl } from '@/src/utils/authRedirectState'
import { toAuthErrorMessage } from '@/src/utils/authErrors'
import { getPasswordValidationError } from '@/src/utils/password'
import { devWarn } from '@/src/utils/safeLogger'

type LegalDoc = 'terms' | 'privacy' | null

const openLegalDoc = ref<LegalDoc>(null)

const fullName = ref('')
const username = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')

const loading = ref(false)
const error = ref<string | null>(null)
const success = ref(false)
const submittedEmail = ref<string | null>(null)
const acceptedTerms = ref(false)
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

  const normalizedFullName = fullName.value.trim()
  const normalizedUsername = username.value.trim()
  const normalizedEmail = email.value.trim()

  if (!normalizedFullName) {
    error.value = 'Ad soyad zorunlu.'
    return
  }

  if (!normalizedUsername) {
    error.value = 'Kullanıcı adı zorunlu.'
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

  if (!acceptedTerms.value) {
    error.value = 'Devam etmek için kullanıcı sözleşmesini kabul etmelisiniz'
    return
  }

  loading.value = true

  try {
    const emailRedirectTo = issueAuthRedirectUrl('/login', 'signup-verification')
    const supabase = useSupabase()

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: password.value,
      options: {
        data: {
          full_name: normalizedFullName,
          username: normalizedUsername,
        },
        emailRedirectTo,
      },
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
            id="signup-full-name"
            v-model="fullName"
            label="Ad soyad"
            placeholder="Adını ve soyadını gir"
            autocomplete="name"
            required
          />

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

          <label class="auth-consent">
            <input v-model="acceptedTerms" type="checkbox" class="auth-consent__input" />
            <span class="auth-consent__copy">
              <span>Kullanıcı</span>
              <button type="button" class="auth-inline-link" @click="openLegalDoc = 'terms'">sözleşmesini</button>
              <span>ve</span>
              <button type="button" class="auth-inline-link" @click="openLegalDoc = 'privacy'">gizlilik politikasını</button>
              <span>okudum, kabul ediyorum.</span>
            </span>
          </label>

          <AuthButton type="submit" :loading="loading">
            Kayıt ol
          </AuthButton>

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

    <AuthLegalModal
      v-if="openLegalDoc"
      :kind="openLegalDoc"
      @close="openLegalDoc = null"
    />
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

.auth-consent {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.75rem;
  align-items: flex-start;
  color: rgba(226, 232, 250, 0.8);
  font-size: 0.92rem;
  line-height: 1.7;
}

.auth-consent__input {
  width: 1rem;
  height: 1rem;
  margin-top: 0.25rem;
  accent-color: #8b5cf6;
}

.auth-consent__copy {
  display: flex;
  flex-wrap: wrap;
  gap: 0.28rem;
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
</style>
