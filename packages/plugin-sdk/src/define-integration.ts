import { compilePattern } from './pattern.js'
import type { HttpMethod, Integration } from './types.js'

const KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/
const HOST_RE =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/
const TLD_RE = /^[a-z]{2,}$/
const METHODS: readonly HttpMethod[] = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']

/** Rejects single-label hosts, localhost, IPv4 literals (any numeric form) and non-alphabetic TLDs. */
function isPublicHostname(host: string): boolean {
  const labels = host.split('.')
  if (labels.length < 2) return false
  if (host === 'localhost' || host.endsWith('.localhost')) return false
  return TLD_RE.test(labels[labels.length - 1]!)
}

/** Validates an integration definition and returns a deeply frozen copy. */
export function defineIntegration(def: Integration): Readonly<Integration> {
  if (!def.id.trim()) throw new Error('Integration id must not be empty')
  if (!def.name.trim()) throw new Error(`Integration "${def.id}": name must not be empty`)

  const seen = new Set<string>()
  for (const check of def.checks) {
    if (!check.id.trim()) throw new Error(`Integration "${def.id}": check id must not be empty`)
    if (seen.has(check.id)) {
      throw new Error(`Integration "${def.id}": duplicate check id "${check.id}"`)
    }
    seen.add(check.id)
  }

  const keys = new Set<string>()
  for (const field of def.credentialsSchema) {
    const where = `Integration "${def.id}": credential "${field.key}"`
    if (!KEY_RE.test(field.key)) throw new Error(`${where}: invalid key`)
    if (keys.has(field.key)) throw new Error(`${where}: duplicate key`)
    keys.add(field.key)
    if (field.secret && field.optional)
      throw new Error(`${where}: a secret field cannot be optional`)
    if (field.pattern !== undefined) {
      if (field.secret) throw new Error(`${where}: a secret field cannot have a pattern`)
      try {
        compilePattern(field.pattern)
      } catch (err) {
        const reason =
          err instanceof Error && !(err instanceof SyntaxError) ? `: ${err.message}` : ''
        throw new Error(`${where}: invalid pattern${reason}`, { cause: err })
      }
    }
  }

  const hosts = def.allowedHosts?.slice()
  if (hosts) {
    const seenHosts = new Set<string>()
    for (const host of hosts) {
      if (typeof host !== 'string' || !HOST_RE.test(host)) {
        throw new Error(`Integration "${def.id}": invalid allowed host "${String(host)}"`)
      }
      if (!isPublicHostname(host)) {
        throw new Error(`Integration "${def.id}": invalid allowed host "${host}"`)
      }
      if (seenHosts.has(host))
        throw new Error(`Integration "${def.id}": duplicate allowed host "${host}"`)
      seenHosts.add(host)
    }
  }

  const methods = def.allowedMethods?.slice()
  if (methods) {
    const seenMethods = new Set<string>()
    for (const method of methods) {
      if (!METHODS.includes(method)) {
        throw new Error(`Integration "${def.id}": invalid allowed method "${String(method)}"`)
      }
      if (seenMethods.has(method)) {
        throw new Error(`Integration "${def.id}": duplicate allowed method "${method}"`)
      }
      seenMethods.add(method)
    }
  }

  return Object.freeze({
    ...def,
    ...(hosts ? { allowedHosts: Object.freeze(hosts) as string[] } : {}),
    ...(methods ? { allowedMethods: Object.freeze(methods) as HttpMethod[] } : {}),
    credentialsSchema: Object.freeze(def.credentialsSchema.map((f) => Object.freeze({ ...f }))),
    checks: Object.freeze(def.checks.map((c) => Object.freeze({ ...c }))),
  }) as Readonly<Integration>
}
