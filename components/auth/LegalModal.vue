<script setup lang="ts">
type LegalDoc = 'terms' | 'privacy'

const props = defineProps<{
  kind: LegalDoc
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const content = computed(() => {
  if (props.kind === 'terms') {
    return {
      title: 'Kullanıcı Sözleşmesi',
      paragraphs: [
        'Bu metin geçici bir kullanıcı sözleşmesi yer tutucusudur.',
        'Hizmeti kullanırken diğer kullanıcılara saygılı davranmayı, topluluk kurallarına uymayı ve beta sürecindeki olası değişiklikleri kabul etmiş olursunuz.',
        'Yayın öncesinde bu alan gerçek hukuki metin ile güncellenecektir.',
      ],
    }
  }

  return {
    title: 'Gizlilik Politikası',
    paragraphs: [
      'Bu metin geçici bir gizlilik politikası yer tutucusudur.',
      'Kimlik doğrulama ve hizmet güvenliği için gerekli olan veriler dışında hassas kişisel veriler depolanmaz.',
      'Yayın öncesinde bu alan gerçek gizlilik metni ile güncellenecektir.',
    ],
  }
})
</script>

<template>
  <div class="auth-legal-modal" @click.self="emit('close')">
    <div class="auth-legal-modal__dialog">
      <div class="auth-legal-modal__header">
        <div>
          <p class="auth-legal-modal__eyebrow">Yasal Bilgi</p>
          <h2 class="auth-legal-modal__title">{{ content.title }}</h2>
        </div>

        <button type="button" class="auth-legal-modal__close" @click="emit('close')">
          Kapat
        </button>
      </div>

      <div class="auth-legal-modal__body">
        <p v-for="paragraph in content.paragraphs" :key="paragraph">
          {{ paragraph }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-legal-modal {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: rgba(2, 6, 23, 0.72);
  backdrop-filter: blur(10px);
}

.auth-legal-modal__dialog {
  width: min(100%, 42rem);
  border: 1px solid rgba(125, 146, 202, 0.16);
  border-radius: 28px;
  background:
    linear-gradient(180deg, rgba(7, 11, 31, 0.96), rgba(4, 8, 24, 0.94)),
    radial-gradient(circle at top right, rgba(139, 92, 246, 0.12), transparent 38%);
  padding: 1.4rem;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 30px 90px -54px rgba(15, 23, 42, 0.96);
}

.auth-legal-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.auth-legal-modal__eyebrow {
  margin: 0;
  color: #8b5cf6;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.auth-legal-modal__title {
  margin: 0.65rem 0 0;
  color: #f8fbff;
  font-family: 'Space Grotesk', 'Manrope', sans-serif;
  font-size: 1.7rem;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.auth-legal-modal__close {
  border: 1px solid rgba(125, 146, 202, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.03);
  padding: 0.6rem 0.9rem;
  color: rgba(226, 232, 250, 0.86);
  font-size: 0.88rem;
  font-weight: 600;
  transition: border-color 180ms ease, background 180ms ease;
}

.auth-legal-modal__close:hover {
  border-color: rgba(96, 165, 250, 0.24);
  background: rgba(255, 255, 255, 0.05);
}

.auth-legal-modal__body {
  display: grid;
  gap: 1rem;
  margin-top: 1.4rem;
  max-height: min(60vh, 32rem);
  overflow-y: auto;
  padding-right: 0.2rem;
}

.auth-legal-modal__body p {
  margin: 0;
  color: rgba(186, 195, 223, 0.84);
  line-height: 1.85;
}
</style>
