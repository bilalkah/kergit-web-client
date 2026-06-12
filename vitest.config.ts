import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

const rootAlias = fileURLToPath(new URL('./', import.meta.url))

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': rootAlias,
      '~': rootAlias,
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
  },
})

