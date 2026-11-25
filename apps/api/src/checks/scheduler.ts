import type { Logger } from '@switchyard/plugin-sdk'
import type { IntegrationRegistry } from '../integrations/registry.js'
import type { SecretBox } from '../crypto/secrets.js'
import type { DueConnection, SchedulerStore, Store } from '../store/types.js'
import { runConnectionChecks } from './run-connection.js'

export interface CheckSchedulerOptions {
  store: Store
  scheduler: SchedulerStore
  registry: IntegrationRegistry
  box: SecretBox
  logger: Logger
  intervalSeconds: number
  tickMs?: number
  batchSize?: number
  /** Max connections of one user claimed per tick (fairness). Default 5. */
  perUserPerTick?: number
  concurrency?: number
  checkTimeoutMs?: number
  retentionDays?: number
  pruneEveryMs?: number
  fetch?: typeof fetch
  now?: () => Date
}

export interface CheckScheduler {
  start(): void
  stop(): Promise<void>
  tick(): Promise<void>
}

export function createCheckScheduler(options: CheckSchedulerOptions): CheckScheduler {
  const {
    store,
    scheduler,
    registry,
    box,
    logger,
    intervalSeconds,
    tickMs = 30_000,
    batchSize = 20,
    perUserPerTick = 5,
    concurrency = 4,
    checkTimeoutMs = 15_000,
    retentionDays = 30,
    pruneEveryMs = 3_600_000,
    fetch: fetchImpl = globalThis.fetch,
    now = () => new Date(),
  } = options

  const stopController = new AbortController()
  let timer: NodeJS.Timeout | undefined
  let running: Promise<void> | undefined
  let lastPrune = now().getTime()
  /** Connections whose previous run left a plugin promise unsettled (hung plugin). */
  const hung = new Set<string>()

  async function processOne(due: DueConnection): Promise<void> {
    const ids = { connectionId: due.connectionId, projectId: due.projectId }
    try {
      const connection = await store.getConnectionForRun(
        due.userId,
        due.projectId,
        due.connectionId,
      )
      if (!connection) return
      const integration = registry.get(connection.integrationId)
      if (!integration) {
        logger.warn('unknown integration, skipping connection', {
          ...ids,
          integrationId: connection.integrationId,
        })
        return
      }
      const { results, pending } = await runConnectionChecks({
        integration,
        connection,
        userId: due.userId,
        box,
        fetch: fetchImpl,
        logger,
        timeoutMs: checkTimeoutMs,
        now: now(),
        signal: stopController.signal,
      })
      // The run returned, but a timed-out plugin may still be running: skip this connection until
      // it settles. setImmediate lets every already-settled promise flush first.
      const settled = await Promise.race([
        pending.then(() => true),
        new Promise<boolean>((resolve) => setImmediate(() => resolve(false))),
      ])
      if (!settled) {
        hung.add(due.connectionId)
        void pending.then(() => hung.delete(due.connectionId))
      }
      if (stopController.signal.aborted) return
      const stored = await store.insertCheckResults(
        due.userId,
        due.projectId,
        due.connectionId,
        results,
      )
      logger.info('checks recorded', {
        ...ids,
        integrationId: integration.id,
        stored,
        statuses: results.map((r) => ({ checkId: r.checkId, status: r.status })),
      })
    } catch (err) {
      logger.error('connection run failed', {
        ...ids,
        error: err instanceof Error ? err.name : 'NonError',
      })
    }
  }

  async function runTick(): Promise<void> {
    let due: DueConnection[]
    try {
      due = await scheduler.claimDueConnections(batchSize, intervalSeconds, perUserPerTick)
    } catch (err) {
      logger.error('claiming due connections failed', {
        error: err instanceof Error ? err.name : 'NonError',
      })
      return
    }
    const skipped = due.filter((d) => hung.has(d.connectionId))
    if (skipped.length > 0) {
      logger.warn('skipping connections with a still-running previous check', {
        connectionIds: skipped.map((d) => d.connectionId),
      })
    }
    const queue = due.filter((d) => !hung.has(d.connectionId))
    const workers = Array.from(
      { length: Math.max(1, Math.min(concurrency, queue.length)) },
      async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          if (stopController.signal.aborted) return
          await processOne(next)
        }
      },
    )
    await Promise.all(workers)

    if (!stopController.signal.aborted && now().getTime() - lastPrune >= pruneEveryMs) {
      lastPrune = now().getTime()
      try {
        const deleted = await scheduler.pruneCheckResults(retentionDays)
        logger.info('check results pruned', { deleted })
      } catch (err) {
        logger.error('pruning check results failed', {
          error: err instanceof Error ? err.name : 'NonError',
        })
      }
    }
  }

  function tick(): Promise<void> {
    if (running) return running
    running = runTick().finally(() => {
      running = undefined
    })
    return running
  }

  return {
    tick,
    start() {
      if (timer || stopController.signal.aborted) return
      timer = setInterval(() => void tick(), tickMs)
      timer.unref()
      void tick()
    },
    async stop() {
      if (timer) clearInterval(timer)
      timer = undefined
      stopController.abort()
      await running
    },
  }
}
