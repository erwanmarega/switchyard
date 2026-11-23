// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: false },
  telemetry: false,
  devServer: { port: 3000 },
  css: [
    '@fontsource/geist-pixel/400.css',
    '@fontsource-variable/inter',
    '@fontsource/jetbrains-mono/400.css',
    '@fontsource/jetbrains-mono/500.css',
    '~/assets/css/tokens.css',
    '~/assets/css/main.css',
  ],
  app: {
    head: {
      htmlAttrs: { lang: 'fr' },
      title: 'Switchyard',
    },
  },
  runtimeConfig: {
    // Private (server only): the browser reaches the API through the /api proxy route.
    // Overridable with NUXT_API_BASE.
    apiBase: 'http://127.0.0.1:3001',
    // Set NUXT_TRUST_FRONT_PROXY=true only when a trusted reverse proxy in front of Nitro sets
    // X-Forwarded-For; otherwise the header is ignored and the socket address is used.
    trustFrontProxy: false,
  },
  // Pages that embed the session user (SSR payload) must never be cached by browsers or proxies.
  routeRules: {
    '/dashboard': { headers: { 'cache-control': 'private, no-store' } },
    '/connexion': { headers: { 'cache-control': 'private, no-store' } },
  },
  // @switchyard/plugin-sdk exposes its TypeScript source behind the custom `source`
  // export condition: enable it for the client bundle, SSR, and the Nitro server build.
  vite: {
    resolve: { conditions: ['source'] },
    ssr: { resolve: { conditions: ['source'] } },
  },
  typescript: {
    tsConfig: { compilerOptions: { customConditions: ['source'] } },
    nodeTsConfig: { compilerOptions: { customConditions: ['source'] } },
  },
})
