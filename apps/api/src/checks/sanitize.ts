import type { Check, CheckStatus } from '@switchyard/plugin-sdk'
import type { NewCheckResult } from '../store/types.js'

const MIN_SECRET_LENGTH = 4
const MAX_DEPTH = 10
const MAX_MESSAGE_LENGTH = 2000
const MAX_DETAILS_BYTES = 8 * 1024
// jsonb costs ~12 bytes per tiny element (`[0,0,...]` is 6x bigger than its text), so bound the
// element count too: it keeps jsonb under the database check (16 KB) whatever the shape.
const MAX_DETAILS_NODES = 500
const STATUSES: ReadonlySet<string> = new Set<CheckStatus>(['ok', 'warning', 'error', 'unknown'])

export const REDACTED = '***'

/**
 * Secret values worth redacting (short ones would mangle unrelated text) plus their common derived
 * forms (URL-encoded, JSON-escaped, base64, base64url), deduplicated, longest first.
 */
function redactionList(secrets: readonly string[]): string[] {
  const forms = new Set<string>()
  for (const secret of secrets) {
    if (secret.length < MIN_SECRET_LENGTH) continue
    forms.add(secret)
    forms.add(encodeURIComponent(secret))
    forms.add(JSON.stringify(secret).slice(1, -1))
    const bytes = Buffer.from(secret)
    forms.add(bytes.toString('base64'))
    forms.add(bytes.toString('base64url'))
  }
  return [...forms].filter((f) => f.length >= MIN_SECRET_LENGTH).sort((a, b) => b.length - a.length)
}

/** Redacts secrets, then strips NUL (rejected by Postgres) and lone surrogates (invalid UTF-8). */
function redactString(value: string, list: readonly string[]): string {
  let out = value
  for (const secret of list) out = out.replaceAll(secret, REDACTED)
  return out.replaceAll('\u0000', '').toWellFormed()
}

const DROP = Symbol('drop')

function isPlainObject(value: object): value is Record<string, unknown> {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function copy(
  value: unknown,
  list: readonly string[],
  depth: number,
  ancestors: Set<object>,
): unknown {
  if (typeof value === 'string') return redactString(value, list)
  if (typeof value === 'boolean' || value === null) return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : DROP
  if (typeof value !== 'object') return DROP // undefined, function, symbol, bigint
  if (depth > MAX_DEPTH || ancestors.has(value)) return DROP
  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      return value.map((item) => {
        const c = copy(item, list, depth + 1, ancestors)
        return c === DROP ? null : c
      })
    }
    if (!isPlainObject(value)) return DROP
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      const c = copy(item, list, depth + 1, ancestors)
      if (c !== DROP)
        Object.defineProperty(out, redactString(key, list), {
          value: c,
          enumerable: true,
          writable: true,
          configurable: true,
        })
    }
    return out
  } catch {
    // Hostile getters/proxies: drop the value rather than fail the run.
    return DROP
  } finally {
    ancestors.delete(value)
  }
}

/**
 * Deep copy of a JSON-like value where every occurrence of a secret is replaced by `***`.
 * Non-JSON values are dropped (null inside arrays); cycles and depth > 10 are dropped.
 * Returns `undefined` when the whole value was dropped.
 */
export function redactSecrets(value: unknown, secrets: readonly string[]): unknown {
  const c = copy(value, redactionList(secrets), 0, new Set())
  return c === DROP ? undefined : c
}

function countNodes(value: unknown): number {
  if (typeof value !== 'object' || value === null) return 1
  const children = Array.isArray(value) ? value : Object.entries(value).flat()
  return 1 + children.reduce<number>((n, c) => n + countNodes(c), 0)
}

/** Turns whatever a plugin returned into a storable result. Never trusts the plugin's fields. */
export function sanitizeResult(
  raw: unknown,
  check: Check,
  secrets: readonly string[],
  now: Date,
): NewCheckResult {
  const obj =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : ({} as const)
  const read = (key: string): unknown => {
    try {
      return (obj as Record<string, unknown>)[key]
    } catch {
      return undefined
    }
  }

  const rawStatus = read('status')
  const status: CheckStatus =
    typeof rawStatus === 'string' && STATUSES.has(rawStatus)
      ? (rawStatus as CheckStatus)
      : 'unknown'

  const rawMessage = read('message')
  const message =
    typeof rawMessage === 'string' && rawMessage.length > 0
      ? (redactSecrets(rawMessage, secrets) as string).slice(0, MAX_MESSAGE_LENGTH).toWellFormed()
      : 'Résultat invalide.'

  let details: Record<string, unknown> | null = null
  const rawDetails = read('details')
  if (typeof rawDetails === 'object' && rawDetails !== null && !Array.isArray(rawDetails)) {
    const clean = redactSecrets(rawDetails, secrets)
    if (clean !== undefined && typeof clean === 'object' && clean !== null) {
      details =
        Buffer.byteLength(JSON.stringify(clean), 'utf8') > MAX_DETAILS_BYTES ||
        countNodes(clean) > MAX_DETAILS_NODES
          ? { truncated: true }
          : (clean as Record<string, unknown>)
    }
  }

  return { checkId: check.id, status, message, details, checkedAt: now.toISOString() }
}
