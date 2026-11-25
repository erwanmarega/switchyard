import { defineIntegration } from '@switchyard/plugin-sdk'
import type { Check, CheckResult, IntegrationContext } from '@switchyard/plugin-sdk'
import { z } from 'zod'

const API_BASE = 'https://api.vercel.com'
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const STALE_BUILD_MS = 30 * 60 * 1000
const MAX_LISTED_KEYS = 50

const PROJECT_ID_PATTERN = '[A-Za-z0-9][A-Za-z0-9._-]{0,99}'
const TEAM_ID_PATTERN = '[A-Za-z0-9][A-Za-z0-9_-]{0,99}'
const PROJECT_ID_RE = new RegExp(`^(?:${PROJECT_ID_PATTERN})$`)
const TEAM_ID_RE = new RegExp(`^(?:${TEAM_ID_PATTERN})$`)
const ERROR_CODE_RE = /^[A-Z0-9_]{1,64}$/
const STATE_RE = /^[A-Z_]{1,32}$/
const DEPLOYMENT_ID_RE = /^dpl_[A-Za-z0-9]{1,64}$/
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,255}$/

const MSG_UNEXPECTED = 'Vercel injoignable ou réponse inattendue.'

// Zod objects strip unknown fields by default: only the fields below survive parsing.
const deploymentsSchema = z.object({
  deployments: z.array(
    z.object({
      uid: z.string().optional(),
      readyState: z.string().optional(),
      state: z.string().optional(),
      created: z.number().optional(),
      errorCode: z.string().nullish(),
    }),
  ),
})

const envEntrySchema = z.object({
  key: z.string(),
  target: z.union([z.string(), z.array(z.string())]).nullish(),
  gitBranch: z.string().nullish(),
})

// Only these fields are kept from the response; `value` is dropped at parse time.
const envsSchema = z.union([
  z.object({
    // Malformed entries become null; valid ones are stripped to the fields above (no `value`).
    envs: z.array(envEntrySchema.nullable().catch(null)),
    pagination: z.object({ next: z.unknown().nullish() }).nullish(),
  }),
  envEntrySchema,
])

type ClientResult<T> = { ok: true; data: T } | { ok: false; result: CheckResult }

function result(
  checkId: string,
  status: CheckResult['status'],
  message: string,
  details?: Record<string, unknown>,
): CheckResult {
  return {
    checkId,
    status,
    message,
    ...(details ? { details } : {}),
    checkedAt: new Date().toISOString(),
  }
}

async function vercelGet<T>(
  checkId: string,
  ctx: IntegrationContext,
  path: string,
  query: Record<string, string>,
  schema: z.ZodType<T>,
): Promise<ClientResult<T>> {
  const fail = (
    status: CheckResult['status'],
    message: string,
    httpStatus?: number,
  ): ClientResult<T> => ({
    ok: false,
    result: result(checkId, status, message, httpStatus === undefined ? undefined : { httpStatus }),
  })

  const token = ctx.credentials.token
  const teamId = ctx.credentials.teamId
  if (!token) return fail('unknown', 'Configuration invalide.')
  if (teamId !== undefined && teamId !== '' && !TEAM_ID_RE.test(teamId)) {
    return fail('unknown', 'Configuration invalide.')
  }

  const params = new URLSearchParams(query)
  if (teamId) params.set('teamId', teamId)
  const url = `${API_BASE}${path}?${params.toString()}`

  let response: Response
  try {
    response = await ctx.fetch(url, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      signal: ctx.signal,
    })
  } catch {
    return fail('unknown', MSG_UNEXPECTED)
  }

  const httpStatus = response.status
  if (httpStatus === 401 || httpStatus === 403) {
    ctx.logger.warn('Vercel API refused the request', { httpStatus })
    return fail('error', 'Token Vercel invalide ou sans accès à ce projet.', httpStatus)
  }
  if (httpStatus === 404) return fail('error', 'Projet Vercel introuvable.', httpStatus)
  if (httpStatus === 429) {
    return fail(
      'unknown',
      'Limite de requêtes Vercel atteinte, nouvel essai au prochain passage.',
      httpStatus,
    )
  }
  if (httpStatus < 200 || httpStatus >= 300) {
    ctx.logger.warn('Vercel API unexpected status', { httpStatus })
    return fail('unknown', MSG_UNEXPECTED, httpStatus)
  }

  let body: unknown
  try {
    body = await ctx.readJson(response, MAX_RESPONSE_BYTES)
  } catch {
    return fail('unknown', MSG_UNEXPECTED, httpStatus)
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) return fail('unknown', MSG_UNEXPECTED, httpStatus)
  return { ok: true, data: parsed.data }
}

function validProjectId(ctx: IntegrationContext): string | null {
  const projectId = ctx.credentials.projectId
  return projectId !== undefined && PROJECT_ID_RE.test(projectId) ? projectId : null
}

function toTargets(target: string | string[] | null | undefined): string[] {
  if (target === null || target === undefined) return []
  return Array.isArray(target) ? target : [target]
}

function createProductionDeploymentCheck(now: () => number): Check {
  const id = 'production-deployment'
  return {
    id,
    title: 'Dernier déploiement de production',
    async run(ctx) {
      const projectId = validProjectId(ctx)
      if (!projectId) return result(id, 'unknown', 'Configuration invalide.')

      const res = await vercelGet(
        id,
        ctx,
        '/v7/deployments',
        { projectId, target: 'production', limit: '1' },
        deploymentsSchema,
      )
      if (!res.ok) return res.result

      const deployment = res.data.deployments[0]
      if (!deployment) {
        return result(id, 'warning', 'Aucun déploiement de production trouvé.')
      }

      const state = deployment.readyState ?? deployment.state
      const details: Record<string, unknown> = {}
      if (deployment.uid && DEPLOYMENT_ID_RE.test(deployment.uid)) {
        details.deploymentId = deployment.uid
      }
      if (state && STATE_RE.test(state)) details.state = state
      const created = deployment.created
      const createdValid = typeof created === 'number' && Number.isFinite(created)
      if (createdValid) {
        const date = new Date(created)
        if (!Number.isNaN(date.getTime())) details.createdAt = date.toISOString()
      }

      switch (state) {
        case 'READY':
          return result(id, 'ok', 'Le dernier déploiement de production est en ligne.', details)
        case 'ERROR':
          if (deployment.errorCode && ERROR_CODE_RE.test(deployment.errorCode)) {
            details.errorCode = deployment.errorCode
          }
          return result(id, 'error', 'Le dernier déploiement de production a échoué.', details)
        case 'CANCELED':
          return result(
            id,
            'warning',
            'Le dernier déploiement de production a été annulé.',
            details,
          )
        case 'BUILDING':
        case 'QUEUED':
        case 'INITIALIZING': {
          const fresh = createdValid && now() - created < STALE_BUILD_MS
          return fresh
            ? result(id, 'ok', 'Un déploiement de production est en cours.', details)
            : result(
                id,
                'warning',
                'Un déploiement de production est bloqué depuis plus de 30 minutes.',
                details,
              )
        }
        default:
          return result(
            id,
            'warning',
            'État du dernier déploiement de production inattendu.',
            details,
          )
      }
    },
  }
}

const envPreviewOnlyCheck: Check = {
  id: 'env-preview-only',
  title: 'Variables preview absentes en production',
  async run(ctx) {
    const id = 'env-preview-only'
    const projectId = validProjectId(ctx)
    if (!projectId) return result(id, 'unknown', 'Configuration invalide.')

    const res = await vercelGet(
      id,
      ctx,
      `/v10/projects/${encodeURIComponent(projectId)}/env`,
      {},
      envsSchema,
    )
    if (!res.ok) return res.result

    const data = res.data
    let rawEnvs: unknown[]
    let partial = false
    if ('envs' in data && Array.isArray(data.envs)) {
      rawEnvs = data.envs
      const pagination = (data as { pagination?: { next?: unknown } | null }).pagination
      partial = pagination?.next !== null && pagination?.next !== undefined
    } else {
      rawEnvs = [data]
    }

    const preview = new Set<string>()
    const production = new Set<string>()
    for (const raw of rawEnvs) {
      const parsed = envEntrySchema.safeParse(raw)
      if (!parsed.success) continue
      // Pick only the needed fields: `value` is never read.
      const { key, target, gitBranch } = parsed.data
      const targets = toTargets(target)
      if (targets.includes('production')) production.add(key)
      if (targets.includes('preview') && !gitBranch) preview.add(key)
    }

    const missing = [...preview].filter((key) => !production.has(key)).sort()
    if (missing.length === 0) {
      return result(
        id,
        'ok',
        partial
          ? 'Aucune variable de preview manquante en production (résultat partiel).'
          : 'Toutes les variables de preview existent aussi en production.',
        partial ? { partial: true } : undefined,
      )
    }

    const listed = missing.filter((key) => ENV_KEY_RE.test(key)).slice(0, MAX_LISTED_KEYS)
    const details: Record<string, unknown> = { missing: listed, total: missing.length }
    if (partial) details.partial = true
    const suffix = partial ? ' (résultat partiel)' : ''
    const message = `${missing.length} variable(s) définie(s) en preview mais absente(s) en production${suffix}.`
    return result(id, 'warning', message, details)
  },
}

export interface VercelIntegrationOptions {
  now?: () => number
}

export function createVercelIntegration({ now = () => Date.now() }: VercelIntegrationOptions = {}) {
  return defineIntegration({
    id: 'vercel',
    name: 'Vercel',
    allowedHosts: ['api.vercel.com'],
    credentialsSchema: [
      { key: 'token', label: 'Token d’accès Vercel', secret: true },
      {
        key: 'projectId',
        label: 'Projet (id ou nom)',
        secret: false,
        pattern: PROJECT_ID_PATTERN,
      },
      {
        key: 'teamId',
        label: 'Équipe (id, facultatif)',
        secret: false,
        optional: true,
        pattern: TEAM_ID_PATTERN,
      },
    ],
    checks: [createProductionDeploymentCheck(now), envPreviewOnlyCheck],
  })
}

export const vercelIntegration = createVercelIntegration()
