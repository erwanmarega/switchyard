import type { CheckStatus, ProjectPath } from '@switchyard/plugin-sdk'
import type { NodeDiagnostic, ProjectOverviewData, TraceStep } from './diagnostics'

/** Demo project path: Domaine -> Cloudflare -> Vercel -> Supabase / Resend, Stripe -> Vercel. */
export const demoPath: ProjectPath = {
  nodes: [
    { id: 'domain', integrationId: 'registrar', label: 'Domaine' },
    { id: 'cloudflare', integrationId: 'cloudflare', label: 'Cloudflare' },
    { id: 'vercel', integrationId: 'vercel', label: 'Vercel' },
    { id: 'supabase', integrationId: 'supabase', label: 'Supabase' },
    { id: 'stripe', integrationId: 'stripe', label: 'Stripe' },
    { id: 'resend', integrationId: 'resend', label: 'Resend' },
  ],
  edges: [
    { id: 'e-domain-cloudflare', from: 'domain', to: 'cloudflare', label: 'DNS' },
    { id: 'e-cloudflare-vercel', from: 'cloudflare', to: 'vercel' },
    { id: 'e-vercel-supabase', from: 'vercel', to: 'supabase' },
    { id: 'e-stripe-vercel', from: 'stripe', to: 'vercel', label: 'Webhooks' },
    { id: 'e-vercel-resend', from: 'vercel', to: 'resend', label: 'E-mails' },
  ],
}

/** Static demo statuses (no real checks are run yet). */
export const demoStatuses: Record<string, CheckStatus> = {
  domain: 'ok',
  cloudflare: 'warning',
  vercel: 'error',
  supabase: 'ok',
  stripe: 'error',
  resend: 'ok',
}

/** Every node healthy, for the "état normal" view. */
export const demoHealthyStatuses: Record<string, CheckStatus> = Object.fromEntries(
  demoPath.nodes.map((n) => [n.id, 'ok' as CheckStatus]),
)

// Demo day is 2026-11-23, Paris = UTC+1: 13:31Z reads 14h31, 13:02Z reads 14h02.
const CHECKED_AT = '2026-11-23T13:31:00Z'
const INCIDENT_AT = '2026-11-23T13:02:00Z'

/** Trace from the Stripe symptom up to the probable Vercel deployment cause. */
const incidentTrace: TraceStep[] = [
  { label: 'Stripe', role: 'symptôme', detail: '14 webhooks en échec', status: 'error' },
  {
    label: 'Vercel · /api/stripe',
    detail: 'Erreur 500 à la réception',
    status: 'error',
  },
  {
    label: 'Déploiement de 14h02',
    detail: 'Variable de production manquante depuis cette mise en ligne',
    status: 'error',
    cause: true,
  },
]

/** Simulated diagnostics for the demo nodes, consistent with `demoStatuses`. */
export const demoDiagnostics: Record<string, NodeDiagnostic> = {
  domain: {
    statusLine: 'OK · expire dans 210 j',
    description: 'Nom de domaine · registrar',
    summary: 'Le domaine résout correctement et n’expire pas avant longtemps.',
    checkedAt: CHECKED_AT,
    checks: [
      {
        id: 'dns',
        label: 'Résolution DNS',
        status: 'ok',
        detail: 'Les enregistrements A et CNAME répondent.',
      },
      {
        id: 'expiry',
        label: 'Expiration du domaine',
        status: 'ok',
        detail: 'Expire dans 210 jours, renouvellement automatique actif.',
      },
    ],
  },
  cloudflare: {
    statusLine: 'Attention · SSL expire dans 12 j',
    description: 'DNS, proxy et certificat',
    summary: 'Le certificat SSL expire bientôt.',
    checkedAt: CHECKED_AT,
    checks: [
      { id: 'proxy', label: 'Proxy actif', status: 'ok', detail: 'Le trafic passe par le proxy.' },
      {
        id: 'ssl',
        label: 'Certificat SSL',
        status: 'warning',
        detail: 'Expire dans 12 jours : renouvellement à prévoir.',
      },
    ],
    console: { label: 'Ouvrir dans Cloudflare', url: 'https://dash.cloudflare.com' },
    suggestion: 'Renouvelez le certificat SSL avant son expiration.',
  },
  vercel: {
    statusLine: 'Bloqué · /api/stripe en 500',
    description: 'Hébergement et API · environnement production',
    since: INCIDENT_AT,
    summary: 'La route /api/stripe renvoie 500 depuis le déploiement de 14h02.',
    checkedAt: CHECKED_AT,
    checks: [
      {
        id: 'route-stripe',
        label: 'Route /api/stripe',
        status: 'error',
        detail: 'Erreur 500 sur chaque appel depuis 14h02',
      },
      {
        id: 'env',
        label: 'Variables d’environnement',
        status: 'error',
        detail: 'STRIPE_WEBHOOK_SECRET absente en production, présente en preview',
      },
      {
        id: 'deploy',
        label: 'Déploiement de 14h02',
        status: 'ok',
        detail: 'Build réussi, en ligne en production',
      },
      { id: 'route-health', label: 'Route /api/health', status: 'ok', detail: 'Répond en 200' },
      {
        id: 'domain',
        label: 'Domaine personnalisé',
        status: 'ok',
        detail: 'Pointe vers le déploiement actif',
      },
    ],
    console: { label: 'Ouvrir dans Vercel', url: 'https://vercel.com/dashboard' },
    lastError: { at: INCIDENT_AT, code: '500', message: 'POST /api/stripe → 500' },
    suggestion: 'Ajoutez STRIPE_WEBHOOK_SECRET aux variables de production puis redéployez.',
    trace: incidentTrace,
  },
  supabase: {
    statusLine: 'OK · quota à 38 %',
    description: 'Base de données Postgres',
    summary: 'La base répond normalement.',
    checkedAt: CHECKED_AT,
    checks: [
      {
        id: 'connection',
        label: 'Connexion',
        status: 'ok',
        detail: 'La base accepte les connexions.',
      },
      { id: 'quota', label: 'Quota', status: 'ok', detail: '38 % utilisé' },
    ],
  },
  stripe: {
    statusLine: 'Bloqué · 14 webhooks en échec',
    description: 'Paiements et webhooks',
    since: INCIDENT_AT,
    summary: 'Les webhooks ne parviennent plus à votre application.',
    checkedAt: CHECKED_AT,
    checks: [
      { id: 'api-key', label: 'Clé API valide', status: 'ok', detail: 'Clé secrète acceptée.' },
      {
        id: 'webhooks',
        label: 'Livraison des webhooks',
        status: 'error',
        detail: '14 échecs depuis 14h02 : /api/stripe répond 500',
      },
    ],
    console: { label: 'Ouvrir dans Stripe', url: 'https://dashboard.stripe.com' },
    lastError: {
      at: INCIDENT_AT,
      code: 'HTTP_500',
      message: 'Internal Server Error sur POST /api/stripe (14 événements en échec).',
    },
    suggestion:
      'Vérifiez le dernier déploiement Vercel ou rejouez les événements en échec depuis Stripe.',
    trace: incidentTrace,
  },
  resend: {
    statusLine: 'OK',
    description: 'E-mails transactionnels',
    summary: 'Les e-mails partent normalement.',
    checkedAt: CHECKED_AT,
    checks: [
      { id: 'domain', label: 'Domaine vérifié', status: 'ok', detail: 'SPF et DKIM valides.' },
    ],
  },
}

/** Project-level data for the demo incident (Stripe webhooks failing after a Vercel deploy). */
export const demoProject: ProjectOverviewData = {
  name: 'mon-saas',
  incident: {
    message:
      'Stripe ne parvient plus à livrer ses webhooks : /api/stripe renvoie 500 depuis le déploiement Vercel de 14h02.',
    highlight: '/api/stripe',
    since: INCIDENT_AT,
    causeNodeId: 'vercel',
    symptomNodeId: 'stripe',
    brokenEdgeIds: ['e-stripe-vercel'],
    causeTag: 'DÉPLOIEMENT 14H02',
    action: { label: 'Voir le déploiement de 14h02', url: 'https://vercel.com/dashboard' },
  },
  deadlines: [
    { label: 'Certificat SSL · Cloudflare', value: 'dans 12 j' },
    { label: 'Nom de domaine', value: 'dans 210 j' },
    { label: 'Quota Supabase', value: '38 % utilisé' },
  ],
  nextCheckAt: '2026-11-23T13:36:00Z',
}

/** Same project with every node healthy and no incident. */
export const demoHealthyProject: ProjectOverviewData = { ...demoProject, incident: null }
