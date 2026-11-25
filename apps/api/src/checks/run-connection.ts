import type { Check, Integration, IntegrationContext, Logger } from '@switchyard/plugin-sdk'
import { openConnectionSecrets } from '../connections/credentials.js'
import type { SecretBox } from '../crypto/secrets.js'
import type { NewCheckResult, RunnableConnection } from '../store/types.js'
import { redactSecrets, sanitizeResult } from './sanitize.js'

export const DEFAULT_CHECK_TIMEOUT_MS = 15_000
const MAX_LOGGED_MESSAGE = 200

export interface RunConnectionOptions {
  integration: Readonly<Integration>
  connection: RunnableConnection
  userId: string
  box: SecretBox
  fetch: typeof fetch
  logger: Logger
  timeoutMs?: number
  now: Date
  /** Scheduler stop signal. */
  signal?: AbortSignal
}

export interface RunConnectionOutcome {
  results: NewCheckResult[]
  /**
   * Settles once every plugin promise started by this run has settled. A run returns at the
   * timeout even if a plugin never stops: `pending` tells the caller it is still running.
   */
  pending: Promise<void>
}

class TimeoutError extends Error {
  constructor() {
    super('check timed out')
    this.name = 'TimeoutError'
  }
}

function unknownResult(check: Check, message: string, now: Date): NewCheckResult {
  return {
    checkId: check.id,
    status: 'unknown',
    message,
    details: null,
    checkedAt: now.toISOString(),
  }
}

function errorResult(check: Check, message: string, now: Date): NewCheckResult {
  return {
    checkId: check.id,
    status: 'error',
    message,
    details: null,
    checkedAt: now.toISOString(),
  }
}

function redactedText(value: unknown, secrets: string[]): string {
  const text = typeof value === 'string' ? value : ''
  return (redactSecrets(text, secrets) as string).slice(0, MAX_LOGGED_MESSAGE)
}

function redactingLogger(base: Logger, secrets: string[]): Logger {
  const wrap =
    (level: keyof Logger) =>
    (message: string, meta?: Record<string, unknown>): void => {
      const safeMessage = redactedText(String(message), secrets)
      const safeMeta = meta === undefined ? undefined : redactSecrets(meta, secrets)
      base[level](
        safeMessage,
        safeMeta !== undefined && typeof safeMeta === 'object' && !Array.isArray(safeMeta)
          ? (safeMeta as Record<string, unknown>)
          : undefined,
      )
    }
  return { debug: wrap('debug'), info: wrap('info'), warn: wrap('warn'), error: wrap('error') }
}

const DEFAULT_METHODS: readonly string[] = ['GET', 'HEAD']

interface ValidatedRequest {
  url: URL
  method: string
}

/**
 * Only absolute https URLs on an allowed host, default port, no embedded credentials, allowed
 * method. Throws a TypeError with a generic message (never the URL) otherwise. Returns the
 * validated snapshot, which is what must be sent: the input is read exactly once.
 */
function assertAllowed(
  integration: Readonly<Integration>,
  input: Parameters<typeof fetch>[0],
  init: RequestInit | undefined,
): ValidatedRequest {
  const request = input instanceof Request ? input : undefined
  const url = new URL(request ? request.url : String(input))
  if (url.protocol !== 'https:') throw new TypeError('ctx.fetch only allows https: URLs')
  if (!integration.allowedHosts?.includes(url.hostname.toLowerCase())) {
    throw new TypeError('ctx.fetch: host not allowed for this integration')
  }
  if (url.username !== '' || url.password !== '' || url.port !== '') {
    throw new TypeError('ctx.fetch: credentials and custom ports are not allowed in URLs')
  }
  const method = String(init?.method ?? request?.method ?? 'GET').toUpperCase()
  if (!(integration.allowedMethods ?? DEFAULT_METHODS).includes(method)) {
    throw new TypeError('ctx.fetch: method not allowed for this integration')
  }
  return { url, method }
}

export const DEFAULT_JSON_MAX_BYTES = 1024 * 1024
export const HARD_JSON_MAX_BYTES = 10 * 1024 * 1024

const BAD_BODY = 'response body unreadable or too large'

/** Builds `ctx.readJson`: parses a JSON body with a streaming size cap (see the SDK types). */
export function createReadJson(): IntegrationContext['readJson'] {
  return async (response, maxBytes = DEFAULT_JSON_MAX_BYTES) => {
    const cap = Number.isFinite(maxBytes)
      ? Math.min(Math.max(Math.trunc(maxBytes), 0), HARD_JSON_MAX_BYTES)
      : DEFAULT_JSON_MAX_BYTES
    const declared = response.headers.get('content-length')
    if (declared !== null && Number(declared) > cap) throw new Error(BAD_BODY)
    if (!response.body) throw new Error(BAD_BODY)

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > cap) {
        await reader.cancel().catch(() => {})
        throw new Error(BAD_BODY)
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: false }).decode(bytes))
    } catch {
      throw new Error('response body is not valid JSON')
    }
  }
}

/** Runs every check of the integration for one connection, sequentially. Never throws. */
export async function runConnectionChecks(
  opts: RunConnectionOptions,
): Promise<RunConnectionOutcome> {
  const { integration, connection, userId, box, logger, now } = opts
  const timeoutMs = opts.timeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS

  let secrets: Record<string, string> = {}
  if (connection.secrets !== null) {
    try {
      secrets = openConnectionSecrets(box, connection.secrets, connection.id, userId)
    } catch {
      logger.warn('connection secrets unreadable', {
        connectionId: connection.id,
        integrationId: integration.id,
      })
      return {
        results: integration.checks.map((check) =>
          unknownResult(check, 'Identifiants illisibles : ressaisissez-les.', now),
        ),
        pending: Promise.resolve(),
      }
    }
  }
  const credentials = Object.freeze({ ...connection.config, ...secrets })
  const secretValues = Object.values(secrets).filter((v): v is string => typeof v === 'string')
  const safeLogger = redactingLogger(logger, secretValues)

  const results: NewCheckResult[] = []
  const started: Promise<unknown>[] = []
  const readJson = createReadJson()
  for (const check of integration.checks) {
    const timeout = new AbortController()
    const signals = [timeout.signal]
    if (opts.signal) signals.push(opts.signal)
    const signal = AbortSignal.any(signals)

    const ctxFetch: typeof fetch = async (input, init) => {
      // Snapshot init once: getters on it must not return different values later.
      const snapshot: RequestInit = { ...init }
      const { url, method } = assertAllowed(integration, input, snapshot)
      const callerSignal = snapshot.signal
      // Redirects are never followed: the allowlist only covers the first URL.
      const safeInit: RequestInit = {
        ...snapshot,
        method,
        redirect: 'error',
        signal: callerSignal ? AbortSignal.any([signal, callerSignal]) : signal,
      }
      // Send the validated snapshot, not the (possibly mutable) caller input.
      return opts.fetch(input instanceof Request ? input : url.href, safeInit)
    }
    const ctx: IntegrationContext = {
      credentials,
      fetch: ctxFetch,
      logger: safeLogger,
      signal,
      readJson,
    }

    let timer: NodeJS.Timeout | undefined
    let onAbort: (() => void) | undefined
    const aborted = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timeout.abort()
        reject(new TimeoutError())
      }, timeoutMs)
      onAbort = () => reject(new Error('check aborted'))
      if (opts.signal?.aborted) onAbort()
      else opts.signal?.addEventListener('abort', onAbort, { once: true })
    })
    aborted.catch(() => {}) // avoid unhandled rejection when the check wins the race

    try {
      const plugin = Promise.resolve().then(() => check.run(ctx))
      started.push(plugin.catch(() => {}))
      const raw = await Promise.race([plugin, aborted])
      results.push(sanitizeResult(raw, check, secretValues, now))
    } catch (err) {
      const timedOut = err instanceof TimeoutError
      const name = err instanceof Error ? err.name : 'NonError'
      logger.warn('check failed', {
        integrationId: integration.id,
        checkId: check.id,
        connectionId: connection.id,
        error: name,
        reason: timedOut
          ? 'timeout'
          : redactedText(err instanceof Error ? err.message : '', secretValues),
      })
      results.push(
        errorResult(
          check,
          timedOut ? 'La vérification a dépassé le délai.' : 'La vérification a échoué.',
          now,
        ),
      )
    } finally {
      clearTimeout(timer)
      if (onAbort) opts.signal?.removeEventListener('abort', onAbort)
    }
  }
  return { results, pending: Promise.all(started).then(() => {}) }
}
