import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { assertLegalDocumentsReadyForRelease } from './src/legal/releaseGuard'

const rootDir = dirname(fileURLToPath(import.meta.url))
const devtoolsEnabled = process.env.NODE_ENV === 'development'

if (process.env.NODE_ENV === 'production') {
  assertLegalDocumentsReadyForRelease({ rootDir })
}

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: devtoolsEnabled },

  // Never ship client source maps to browsers in production (avoids exposing
  // original source/comments about internals). Server maps stay server-only.
  sourcemap: {
    client: false,
  },

  srcDir: '.',
  pages: true,

  css: [
    resolve(rootDir, 'assets/styles/ui.css'),
    resolve(rootDir, 'assets/css/tailwind.css')
  ],

  runtimeConfig: {
    appOrigin: process.env.WEB_DOMAIN ?? '',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    // Private server-only secret used to HMAC normalized emails for the
    // deleted-account email reservation. Never expose under runtimeConfig.public.
    accountEmailHashSecret: process.env.ACCOUNT_EMAIL_HASH_SECRET ?? '',
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

  routeRules: {
    '/app': { ssr: false },
    '/app/**': { ssr: false },
    '/channels/**': { ssr: false },
  },

  app: {
    head: {
      title: 'Kergit',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
      link: [
        { rel: 'icon', type: 'image/png', href: '/icon.png' },
        { rel: 'apple-touch-icon', href: '/icon.png' },
      ],
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
