// https://nuxt.com/docs/api/configuration/nuxt-config
const isProd = process.env.NODE_ENV === 'production'

export default defineNuxtConfig({
  modules: ['nuxt-security'],
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
    // Number of trusted reverse proxies in front of Nitro (NUXT_TRUSTED_PROXY_HOPS, integer >= 0).
    // 0: X-Forwarded-For is ignored and the socket address is the client IP. N: the client IP is
    // the N-th X-Forwarded-For entry from the right (the one appended by your outermost proxy).
    trustedProxyHops: 0,
    // Public origin of the app, e.g. https://switchyard.example.com (NUXT_PUBLIC_ORIGIN). Used for
    // the same-origin check and the e-mail confirmation link when a TLS-terminating proxy does not
    // forward the original host and protocol. Empty: the request URL is used.
    publicOrigin: '',
    // Private (server only): the browser never talks to Supabase nor sees these values. They are
    // set with NUXT_SUPABASE_URL / NUXT_SUPABASE_KEY (the publishable key; never the secret key).
    // In development only, SUPABASE_URL / SUPABASE_KEY from apps/web/.env are accepted as well.
    supabaseUrl: (!isProd && process.env.SUPABASE_URL) || '',
    supabaseKey: (!isProd && process.env.SUPABASE_KEY) || '',
  },
  // Every SSR page can embed the session user in its payload: HTML is never cached. Static assets
  // (/_nuxt, /img, fonts) are served by Nitro's public-assets handler, which bypasses routeRules
  // headers and keeps its own cache headers (hashed /_nuxt files are immutable).
  routeRules: {
    '/**': { headers: { 'cache-control': 'private, no-store' } },
  },
  // Security headers and strict CSP with a per-request nonce (nuxt-security). Only the header and
  // nonce features are enabled: the other modules' features (rate limiter, CSRF, ...) are off.
  security: {
    nonce: true,
    sri: false,
    removeLoggers: false,
    rateLimiter: false,
    requestSizeLimiter: false,
    xssValidator: false,
    corsHandler: false,
    allowedMethodsRestricter: false,
    csrf: false,
    headers: {
      contentSecurityPolicy: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'nonce-{{nonce}}'", "'strict-dynamic'"],
        'script-src-attr': false,
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:'],
        'font-src': ["'self'"],
        'connect-src': ["'self'"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'none'"],
        'object-src': ["'none'"],
        'form-action': ["'self'"],
        'upgrade-insecure-requests': true,
      },
      crossOriginEmbedderPolicy: false,
      xFrameOptions: 'DENY',
      referrerPolicy: 'strict-origin-when-cross-origin',
      permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
    },
  },
  $development: {
    security: {
      headers: {
        contentSecurityPolicy: {
          // Vite HMR talks to the dev server over a WebSocket; no HTTPS upgrade on http://localhost.
          'connect-src': ['ws:', 'wss:'],
          'upgrade-insecure-requests': false,
        },
      },
    },
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
