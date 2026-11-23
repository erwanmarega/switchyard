import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    conditions: ['source'],
    alias: { '~': fileURLToPath(new URL('./app', import.meta.url)) },
  },
  ssr: { resolve: { conditions: ['source'] } },
  // Node by default; component tests opt into jsdom with `// @vitest-environment jsdom`.
  test: { name: 'web', environment: 'node', include: ['test/**/*.test.ts'] },
})
