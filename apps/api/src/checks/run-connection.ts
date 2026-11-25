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

/** Only absolute https URLs: no plain http, no file:, no relative URL. Throws TypeError otherwise. */
function assertHttps(input: Parameters<typeof fetch>[0]): void {
  const raw = input instanceof Request ? input.url : String(input)
  if (new URL(raw).protocol !== 'https:') throw new TypeError('ctx.fetch only allows https: URLs')
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
  for (const check of integration.checks) {
    const timeout = new AbortController()
    const signals = [timeout.signal]
    if (opts.signal) signals.push(opts.signal)
    const signal = AbortSignal.any(signals)

    const ctxFetch: typeof fetch = async (input, init) => {
      assertHttps(input)
      const callerSignal = init?.signal
      return opts.fetch(input, {
        ...init,
        redirect: init?.redirect ?? 'error',
        signal: callerSignal ? AbortSignal.any([signal, callerSignal]) : signal,
      })
    }
    const ctx: IntegrationContext = { credentials, fetch: ctxFetch, logger: safeLogger, signal }

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
