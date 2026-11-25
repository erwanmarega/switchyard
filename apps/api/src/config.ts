import { z } from 'zod'
import { parseEncryptionKey } from './crypto/secrets.js'

export const DEFAULT_ALLOWED_ORIGINS = 'http://localhost:3000,http://127.0.0.1:3000'

const commaList = (fallback: string) =>
  z
    .string()
    .optional()
    .transform((v) =>
      (v ?? fallback)
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    )

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', '[::1]', 'localhost'])

/** True when the Postgres URL targets a loopback host (co-located database). */
function isLoopbackDatabase(url: string): boolean {
  if (!URL.canParse(url)) return false
  return LOOPBACK_HOSTS.has(new URL(url).hostname)
}

const baseSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().min(1).default('127.0.0.1'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Postgres connection string (Supabase). No default on purpose: it carries credentials.
  DATABASE_URL: z
    .string({ error: 'DATABASE_URL is required: copy apps/api/.env.example to apps/api/.env' })
    .min(1, 'DATABASE_URL is required: copy apps/api/.env.example to apps/api/.env')
    .refine((v) => /^postgres(ql)?:\/\//.test(v), 'DATABASE_URL must be a postgresql:// URL'),
  // TLS for the Postgres connection. Defaults to `require` in production, `disable` otherwise.
  DATABASE_SSL: z.enum(['require', 'disable']).optional(),
  // Base URL of the Supabase project (no trailing path). Access tokens are verified against
  // `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` and must carry `iss = ${SUPABASE_URL}/auth/v1`.
  SUPABASE_URL: z
    .string({ error: 'SUPABASE_URL is required: copy apps/api/.env.example to apps/api/.env' })
    .refine((v) => URL.canParse(v), 'SUPABASE_URL must be a valid URL')
    .transform((v) => v.replace(/\/+$/, '')),
  // 32 random bytes, standard base64. Encrypts integration tokens at rest. Exposed as a Buffer.
  // The value is never echoed in error messages.
  SWITCHYARD_ENCRYPTION_KEY: z
    .string({
      error:
        'SWITCHYARD_ENCRYPTION_KEY is required: run `npm run db:env` or generate one with `openssl rand -base64 32`',
    })
    .transform((v, ctx) => {
      try {
        return parseEncryptionKey(v)
      } catch {
        ctx.addIssue({
          code: 'custom',
          message:
            'SWITCHYARD_ENCRYPTION_KEY must be 32 random bytes in base64: run `npm run db:env` or generate one with `openssl rand -base64 32`',
        })
        return z.NEVER
      }
    }),
  // Comma-separated list of origins allowed to call state-changing routes.
  ALLOWED_ORIGINS: commaList(DEFAULT_ALLOWED_ORIGINS),
  // Comma-separated proxies (IPs/CIDRs) whose X-Forwarded-For is trusted (the web app's proxy).
  TRUST_PROXY: commaList('127.0.0.1,::1'),
})

const envSchema = baseSchema
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return
    if (new URL(env.SUPABASE_URL).protocol !== 'https:') {
      ctx.addIssue({
        code: 'custom',
        path: ['SUPABASE_URL'],
        message:
          'SUPABASE_URL must use https:// in production (tokens and keys must not travel in clear text)',
      })
    }
    if (env.DATABASE_SSL === 'disable' && !isLoopbackDatabase(env.DATABASE_URL)) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_SSL'],
        message:
          'DATABASE_SSL=disable is only allowed in production when the database host is loopback (127.0.0.1, ::1, localhost); use DATABASE_SSL=require',
      })
    }
  })
  .transform((env) => ({
    ...env,
    DATABASE_SSL: env.DATABASE_SSL ?? (env.NODE_ENV === 'production' ? 'require' : 'disable'),
  }))

export type Config = z.infer<typeof envSchema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env)
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(parsed.error)}`)
  }
  return parsed.data
}
