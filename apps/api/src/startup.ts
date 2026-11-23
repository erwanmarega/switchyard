import { DEFAULT_ALLOWED_ORIGINS, type Config } from './config.js'

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/** Misconfigurations worth a warning when running in production. Empty outside production. */
export function startupWarnings(config: Config): string[] {
  if (config.NODE_ENV !== 'production') return []
  const warnings: string[] = []
  const supabase = new URL(config.SUPABASE_URL)
  // https is enforced by loadConfig in production, so only the localhost case is left to warn about.
  if (LOCAL_HOSTNAMES.has(supabase.hostname)) {
    warnings.push(
      'SUPABASE_URL points to localhost: use your hosted Supabase project in production',
    )
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
