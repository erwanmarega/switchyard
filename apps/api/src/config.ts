import { z } from 'zod'

const booleanString = z.enum(['true', 'false']).transform((v) => v === 'true')

export const DEFAULT_ALLOWED_ORIGINS = 'http://localhost:3000,http://127.0.0.1:3000'

const envSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    HOST: z.string().min(1).default('127.0.0.1'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().min(1).default('file:./data/switchyard.sqlite'),
    // Registration is open by default; the operator can close it once accounts exist.
    ALLOW_REGISTRATION: booleanString.default(true),
    // Defaults to true in production (HTTPS expected), false otherwise.
    COOKIE_SECURE: booleanString.optional(),
    // Comma-separated list of origins allowed to call state-changing routes.
    ALLOWED_ORIGINS: z
      .string()
      .default(DEFAULT_ALLOWED_ORIGINS)
      .transform((v) =>
        v
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      ),
    // Max register/login attempts per minute per IP. 0 disables rate limiting.
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(0).default(10),
    // Comma-separated proxies (IPs/CIDRs) whose X-Forwarded-For is trusted, so the rate limiter
    // sees the real client IP behind the web app's proxy.
    TRUST_PROXY: z
      .string()
      .default('127.0.0.1,::1')
      .transform((v) =>
        v
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      ),
  })
  .transform((env) => ({
    ...env,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
  }))

export type Config = z.infer<typeof envSchema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env)
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(parsed.error)}`)
  }
  return parsed.data
}
