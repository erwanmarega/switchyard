import { defineIntegration } from '@switchyard/plugin-sdk'

/**
 * EXAMPLE integration, for development only: it talks to no external service.
 * Real integrations (Vercel, Stripe, Cloudflare...) follow the same shape.
 */
export const exampleIntegration = defineIntegration({
  id: 'demo',
  name: 'Demo (example)',
  credentialsSchema: [],
  checks: [
    {
      id: 'always-ok',
      title: 'Always OK',
      run: async () => ({
        checkId: 'always-ok',
        status: 'ok',
        message: 'The demo check always succeeds.',
        checkedAt: new Date().toISOString(),
      }),
    },
  ],
})
