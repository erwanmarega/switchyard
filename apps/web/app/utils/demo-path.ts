import type { CheckStatus, ProjectPath } from '@switchyard/plugin-sdk'

/** Demo project path: Domaine -> Cloudflare -> Vercel -> Base de données, Stripe -> Vercel. */
export const demoPath: ProjectPath = {
  nodes: [
    { id: 'domain', integrationId: 'registrar', label: 'Domaine' },
    { id: 'cloudflare', integrationId: 'cloudflare', label: 'Cloudflare' },
    { id: 'vercel', integrationId: 'vercel', label: 'Vercel' },
    { id: 'database', integrationId: 'database', label: 'Base de données' },
    { id: 'stripe', integrationId: 'stripe', label: 'Stripe' },
  ],
  edges: [
    { id: 'e-domain-cloudflare', from: 'domain', to: 'cloudflare', label: 'DNS' },
    { id: 'e-cloudflare-vercel', from: 'cloudflare', to: 'vercel' },
    { id: 'e-vercel-database', from: 'vercel', to: 'database' },
    { id: 'e-stripe-vercel', from: 'stripe', to: 'vercel', label: 'Webhooks' },
  ],
}

/** Static demo statuses (no real checks are run yet). */
export const demoStatuses: Record<string, CheckStatus> = {
  domain: 'ok',
  cloudflare: 'ok',
  vercel: 'warning',
  database: 'unknown',
  stripe: 'error',
}
