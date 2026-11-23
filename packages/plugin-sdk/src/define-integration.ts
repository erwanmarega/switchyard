import type { Integration } from './types.js'

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

  return Object.freeze({
    ...def,
    credentialsSchema: Object.freeze(def.credentialsSchema.map((f) => Object.freeze({ ...f }))),
    checks: Object.freeze(def.checks.map((c) => Object.freeze({ ...c }))),
  }) as Readonly<Integration>
}
