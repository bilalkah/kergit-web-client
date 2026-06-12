<script setup lang="ts">
import { computed } from 'vue'
import { LEGAL_LOCALE } from '@/src/legal/constants'
import {
  legalDocuments,
  renderLegalDocument,
  type LegalDocumentKind,
} from '@/src/legal/documents'
import { LEGAL_INFO } from '@/src/legal/legalInfo'
import {
  parseLegalMarkdown,
  renderLegalInlineMarkdown,
} from '@/src/legal/markdown'

const props = defineProps<{
  kind: LegalDocumentKind
}>()

const document = computed(() =>
  renderLegalDocument(legalDocuments[props.kind])
)
const otherDocument = computed(() =>
  props.kind === 'terms'
    ? {
      label: 'Gizlilik Politikası / KVKK Aydınlatma Metni',
      to: '/privacy',
    }
    : {
      label: 'Kullanıcı Sözleşmesi',
      to: '/terms',
    }
)
const hasPlaceholders = computed(() =>
  document.value.unresolvedPlaceholders.length > 0
)
const legalBlocks = computed(() => parseLegalMarkdown(document.value.markdown))

</script>

<template>
  <main class="legal-page">
    <section class="legal-page__shell">
      <header class="legal-page__header">
        <NuxtLink to="/" class="legal-page__brand">
          <img class="legal-page__mark" src="/icon.png" alt="" />
          <span>Kergit</span>
        </NuxtLink>

        <NuxtLink :to="otherDocument.to" class="legal-page__switch">
          {{ otherDocument.label }}
        </NuxtLink>
      </header>

      <article class="legal-page__card">
        <p class="legal-page__eyebrow">Yasal Belge</p>
        <h1>{{ document.title }}</h1>

        <dl class="legal-page__meta">
          <div>
            <dt>Sürüm</dt>
            <dd>{{ document.version }}</dd>
          </div>
          <div>
            <dt>Dil</dt>
            <dd>{{ LEGAL_LOCALE }}</dd>
          </div>
          <div>
            <dt>Yürürlük Tarihi</dt>
            <dd>{{ LEGAL_INFO.effectiveDate }}</dd>
          </div>
        </dl>

        <p v-if="hasPlaceholders" class="legal-page__notice">
          Bu metinde henüz doldurulmamış köşeli parantezli alanlar bulunuyor.
          Yayına almadan önce gerçek işletmeci, iletişim, sağlayıcı ve süre bilgileri tamamlanmalıdır.
        </p>

        <article class="legal-markdown" data-testid="legal-markdown-document">
          <template v-for="(block, index) in legalBlocks" :key="`${block.type}-${index}`">
            <h1 v-if="block.type === 'heading' && block.level === 1"
              class="legal-markdown__heading legal-markdown__heading--1"
              v-html="renderLegalInlineMarkdown(block.text)" />

            <h2 v-else-if="block.type === 'heading' && block.level === 2"
              class="legal-markdown__heading legal-markdown__heading--2"
              v-html="renderLegalInlineMarkdown(block.text)" />

            <h3 v-else-if="block.type === 'heading'" class="legal-markdown__heading legal-markdown__heading--3"
              v-html="renderLegalInlineMarkdown(block.text)" />

            <p v-else-if="block.type === 'paragraph'" class="legal-markdown__paragraph"
              v-html="renderLegalInlineMarkdown(block.text)" />

            <ol v-else class="legal-markdown__ordered-list">
              <li v-for="item in block.items" :key="item" v-html="renderLegalInlineMarkdown(item)" />
            </ol>
          </template>
        </article>
      </article>
    </section>
  </main>
</template>

<style scoped>
.legal-page {
  min-height: 100svh;
  padding: clamp(1rem, 3vw, 2rem);
  background:
    radial-gradient(circle at 18% 18%, rgba(91, 88, 255, 0.18), transparent 26%),
    radial-gradient(circle at 82% 16%, rgba(34, 211, 238, 0.12), transparent 24%),
    linear-gradient(180deg, #020617 0%, #03081a 42%, #020512 100%);
}

.legal-page__shell {
  display: grid;
  gap: 1rem;
  width: min(100%, 58rem);
  margin: 0 auto;
}

.legal-page__header,
.legal-page__card {
  border: 1px solid rgba(125, 146, 202, 0.16);
  background:
    linear-gradient(180deg, rgba(7, 11, 31, 0.94), rgba(4, 8, 24, 0.92)),
    radial-gradient(circle at top right, rgba(139, 92, 246, 0.1), transparent 40%);
  box-shadow: 0 28px 80px -54px rgba(15, 23, 42, 0.96);
}

.legal-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-radius: 20px;
  padding: 0.85rem 1rem;
}

.legal-page__brand,
.legal-page__switch {
  display: inline-flex;
  align-items: center;
  color: #f8fbff;
  font-weight: 700;
}

.legal-page__brand {
  min-width: 0;
  gap: 0.75rem;
}

.legal-page__mark {
  width: 2rem;
  height: 2rem;
  flex: 0 0 auto;
  object-fit: contain;
}

.legal-page__switch {
  justify-content: center;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.45);
  padding: 0.7rem 0.9rem;
  color: rgba(218, 226, 247, 0.9);
  font-size: 0.9rem;
}

.legal-page__card {
  border-radius: clamp(22px, 4vw, 30px);
  padding: clamp(1.1rem, 3vw, 1.8rem);
}

.legal-page__eyebrow,
.legal-page__card h1,
.legal-page__meta,
.legal-page__notice {
  margin: 0;
}

.legal-page__eyebrow {
  color: #a78bfa;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.legal-page__card h1 {
  margin-top: 0.5rem;
  color: #f8fbff;
  font-size: clamp(1.7rem, 5vw, 2.7rem);
  line-height: 1.08;
}

.legal-page__meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  margin-top: 1.2rem;
}

.legal-page__meta div {
  border: 1px solid rgba(125, 146, 202, 0.13);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.025);
  padding: 0.8rem;
}

.legal-page__meta dt {
  color: rgba(186, 195, 223, 0.7);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.legal-page__meta dd {
  margin: 0.35rem 0 0;
  color: #eef4ff;
  overflow-wrap: anywhere;
  font-weight: 700;
}

.legal-page__notice {
  margin-top: 1rem;
  border: 1px solid rgba(251, 191, 36, 0.24);
  border-radius: 14px;
  background: rgba(251, 191, 36, 0.08);
  padding: 0.9rem;
  color: #fde68a;
  line-height: 1.65;
}

.legal-page__card :deep(.legal-markdown) {
  margin-top: 1.35rem;
}

.legal-markdown {
  display: grid;
  gap: 0.85rem;
}

.legal-markdown__heading,
.legal-markdown__paragraph,
.legal-markdown__ordered-list {
  margin: 0;
}

.legal-markdown__heading {
  color: #f8fbff;
  line-height: 1.35;
}

.legal-markdown__heading--1 {
  font-size: 1.45rem;
}

.legal-markdown__heading--2 {
  margin-top: 1.25rem;
  font-size: 1.12rem;
}

.legal-markdown__heading--3 {
  margin-top: 0.75rem;
  color: #dbeafe;
  font-size: 1rem;
}

.legal-markdown__paragraph,
.legal-markdown__ordered-list {
  color: rgba(186, 195, 223, 0.88);
  line-height: 1.85;
}

.legal-markdown__ordered-list {
  display: grid;
  gap: 0.45rem;
  padding-left: 1.5rem;
}

.legal-markdown :deep(strong) {
  color: #eef4ff;
}

.legal-markdown :deep(code) {
  border-radius: 4px;
  background: rgba(125, 146, 202, 0.12);
  padding: 0.08rem 0.28rem;
  color: #bfdbfe;
}

@media (max-width: 640px) {
  .legal-page__header {
    align-items: stretch;
    flex-direction: column;
  }

  .legal-page__switch {
    width: 100%;
  }

  .legal-page__meta {
    grid-template-columns: 1fr;
  }
}
</style>
