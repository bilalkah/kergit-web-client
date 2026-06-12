import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const rootDir = dirname(fileURLToPath(import.meta.url))
const devtoolsEnabled = process.env.NODE_ENV === 'development'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: devtoolsEnabled },

  srcDir: '.',
  pages: true,

  css: [
    resolve(rootDir, 'assets/styles/ui.css'),
    resolve(rootDir, 'assets/css/tailwind.css')
  ],

  runtimeConfig: {
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    supabaseAttachmentsBucket: process.env.SUPABASE_ATTACHMENTS_BUCKET ?? 'chat-attachments',
    supabaseAttachmentSignTtlSec: Number(process.env.SUPABASE_ATTACHMENT_SIGN_TTL_SEC ?? '900'),
    chatAttachmentMaxFiles: Number(process.env.CHAT_ATTACHMENT_MAX_FILES ?? '6'),
    chatAttachmentMaxSizeBytes: Number(process.env.CHAT_ATTACHMENT_MAX_SIZE_BYTES ?? '15728640'),
    chatLinkPreviewTimeoutMs: Number(process.env.CHAT_LINK_PREVIEW_TIMEOUT_MS ?? '3000'),
    chatLinkPreviewCacheTtlSec: Number(process.env.CHAT_LINK_PREVIEW_CACHE_TTL_SEC ?? '900'),
    chatLinkPreviewMaxHeadBytes: Number(process.env.CHAT_LINK_PREVIEW_MAX_HEAD_BYTES ?? '262144'),
    chatLinkPreviewMaxOembedBytes: Number(process.env.CHAT_LINK_PREVIEW_MAX_OEMBED_BYTES ?? '131072'),
    chatLinkPreviewMaxRedirects: Number(process.env.CHAT_LINK_PREVIEW_MAX_REDIRECTS ?? '3'),
    chatLinkPreviewCacheMaxEntries: Number(process.env.CHAT_LINK_PREVIEW_CACHE_MAX_ENTRIES ?? '1000'),
    public: {
      supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL ?? '',
      supabaseAnonKey: process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      chatAttachmentMaxFiles: Number(process.env.CHAT_ATTACHMENT_MAX_FILES ?? '6'),
      chatAttachmentMaxSizeBytes: Number(process.env.CHAT_ATTACHMENT_MAX_SIZE_BYTES ?? '15728640'),
    }
  },

  modules: ['@nuxtjs/tailwindcss', '@pinia/nuxt'],

  app: {
    head: {
      title: 'Kergit',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    },
  },

  vite: {
    resolve: {
      // allow pnpm's symlinked deps to resolve their own node_modules
      preserveSymlinks: false,
    },

    worker: {
      format: 'es',
    },

    optimizeDeps: {
      include: ['livekit-client'],
      exclude: [
        '@supabase/supabase-js',
        '@supabase/auth-js',
        '@supabase/functions-js',
        '@supabase/postgrest-js',
        '@supabase/realtime-js',
        '@supabase/storage-js',
      ],
    },
  },
})
