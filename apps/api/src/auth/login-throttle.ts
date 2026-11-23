export const LOGIN_MAX_FAILURES = 5
export const LOGIN_WINDOW_MS = 15 * 60 * 1000
const MAX_ENTRIES = 10_000

interface Entry {
  failures: number
  resetAt: number
}

/**
 * In-memory per-account failed-login limiter, complementing the per-IP rate limit.
 * Keys are normalized emails (known or not, so responses do not reveal which exist).
 * Memory is bounded: expired entries are purged first, then the oldest are evicted.
 */
export class LoginThrottle {
  private readonly entries = new Map<string, Entry>()

  constructor(
    private readonly maxFailures = LOGIN_MAX_FAILURES,
    private readonly windowMs = LOGIN_WINDOW_MS,
    private readonly maxEntries = MAX_ENTRIES,
  ) {}

  isBlocked(key: string, now = Date.now()): boolean {
    const entry = this.entries.get(key)
    if (!entry) return false
    if (entry.resetAt <= now) {
      this.entries.delete(key)
      return false
    }
    return entry.failures >= this.maxFailures
  }

  recordFailure(key: string, now = Date.now()): void {
    const entry = this.entries.get(key)
    if (entry && entry.resetAt > now) {
      entry.failures += 1
      return
    }
    this.entries.delete(key)
    if (this.entries.size >= this.maxEntries) this.evict(now)
    this.entries.set(key, { failures: 1, resetAt: now + this.windowMs })
  }

  reset(key: string): void {
    this.entries.delete(key)
  }

  get size(): number {
    return this.entries.size
  }

  private evict(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key)
    }
    // Map iterates in insertion order: the first keys are the oldest windows.
    for (const key of this.entries.keys()) {
      if (this.entries.size < this.maxEntries) break
      this.entries.delete(key)
    }
  }
}
