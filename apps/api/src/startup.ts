import { DEFAULT_ALLOWED_ORIGINS, type Config } from './config.js'

/** Misconfigurations worth a warning when running in production. Empty outside production. */
export function startupWarnings(config: Config): string[] {
  if (config.NODE_ENV !== 'production') return []
  const warnings: string[] = []
  if (config.ALLOW_REGISTRATION) {
    warnings.push(
      'open registration: anyone who can reach this instance can create an account (set ALLOW_REGISTRATION=false)',
    )
  }
  if (config.AUTH_RATE_LIMIT_MAX === 0) {
    warnings.push('AUTH_RATE_LIMIT_MAX is 0: per-IP rate limiting of login/register is disabled')
  }
  const defaults = DEFAULT_ALLOWED_ORIGINS.split(',')
  const isDefault =
    config.ALLOWED_ORIGINS.length === defaults.length &&
    defaults.every((o) => config.ALLOWED_ORIGINS.includes(o))
  if (isDefault) {
    warnings.push('ALLOWED_ORIGINS is still the localhost default: set your public web origin')
  }
  return warnings
}
