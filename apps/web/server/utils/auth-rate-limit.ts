export interface AuthLimiterOptions {
  /** Max login or signup attempts per client IP and window. */
  ipLimit?: number
  ipWindowMs?: number
  /** Max failed logins per (email, client IP) pair and window. */
  pairMaxFailures?: number
  pairWindowMs?: number
  /** Looser cap on failed logins per email whatever the IP (distributed brute force). */
  emailMaxFailures?: number
  emailWindowMs?: number
  /** Hard cap on tracked keys per map; the oldest entries are evicted beyond it. */
  maxEntries?: number
  now?: () => number
}

export interface LimitResult {
  allowed: boolean
  /** Seconds to wait before retrying, when not allowed. */
  retryAfterSeconds: number
}

interface Counter {
  count: number
  resetAt: number
}

/** Fixed-window counters in a bounded Map (insertion order = creation order). */
class WindowCounters {
  private readonly entries = new Map<string, Counter>()

  constructor(
    private readonly windowMs: number,
    private readonly maxEntries: number,
  ) {}

  get size(): number {
    return this.entries.size
  }

  /** The live counter for a key, dropping it when its window has ended. */
  peek(key: string, now: number): Counter | undefined {
    const entry = this.entries.get(key)
    if (entry && entry.resetAt <= now) {
      this.entries.delete(key)
      return undefined
    }
    return entry
  }

  increment(key: string, now: number): Counter {
    const existing = this.peek(key, now)
    if (existing) {
      existing.count += 1
      return existing
    }
    this.evict(now)
    const created = { count: 1, resetAt: now + this.windowMs }
    this.entries.set(key, created)
    return created
  }

  delete(key: string): void {
    this.entries.delete(key)
  }

  private evict(now: number): void {
    if (this.entries.size < this.maxEntries) return
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key)
    }
    // Still full of live entries: drop the oldest ones.
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next()
      if (oldest.done) break
      this.entries.delete(oldest.value)
    }
  }
}

const retryAfter = (resetAt: number, now: number) => Math.max(1, Math.ceil((resetAt - now) / 1000))

/**
 * In-memory limiter for /auth/login and /auth/signup. Supabase only sees this server's IP, so its
 * per-IP limits cannot tell clients apart: this one counts attempts per client IP and failed
 * logins per (email, IP) pair and per email. State is per process (not shared between instances) and lost on restart.
 */
export function createAuthLimiter(options: AuthLimiterOptions = {}) {
  const {
    ipLimit = 10,
    ipWindowMs = 60_000,
    pairMaxFailures = 5,
    pairWindowMs = 15 * 60_000,
    emailMaxFailures = 50,
    emailWindowMs = 60 * 60_000,
    maxEntries = 10_000,
    now = Date.now,
  } = options
  const ips = new WindowCounters(ipWindowMs, maxEntries)
  const pairs = new WindowCounters(pairWindowMs, maxEntries)
  const emails = new WindowCounters(emailWindowMs, maxEntries)
  // The separator cannot appear in a normalized email (no whitespace) nor in an IP.
  const pairKey = (email: string, ip: string | undefined) => `${email} ${ip ?? 'unknown'}`

  return {
    /** Counts one attempt of `scope` ('login' | 'signup') from `ip`; refuses beyond the limit. */
    hitIp(scope: string, ip: string | undefined): LimitResult {
      const t = now()
      const entry = ips.increment(`${scope}:${ip ?? 'unknown'}`, t)
      return entry.count > ipLimit
        ? { allowed: false, retryAfterSeconds: retryAfter(entry.resetAt, t) }
        : { allowed: true, retryAfterSeconds: 0 }
    },
    /**
     * Whether a login for this (normalized) email from this IP is currently locked out: either
     * the (email, IP) pair failed too often, or the email failed too often from anywhere. A
     * stranger failing from another IP therefore cannot lock the owner out, short of a
     * distributed attack large enough to hit the looser per-email cap.
     */
    checkLogin(email: string, ip: string | undefined): LimitResult {
      const t = now()
      const pair = pairs.peek(pairKey(email, ip), t)
      const any = emails.peek(email, t)
      const waits: number[] = []
      if (pair && pair.count >= pairMaxFailures) waits.push(retryAfter(pair.resetAt, t))
      if (any && any.count >= emailMaxFailures) waits.push(retryAfter(any.resetAt, t))
      return waits.length > 0
        ? { allowed: false, retryAfterSeconds: Math.max(...waits) }
        : { allowed: true, retryAfterSeconds: 0 }
    },
    recordLoginFailure(email: string, ip: string | undefined): void {
      const t = now()
      pairs.increment(pairKey(email, ip), t)
      emails.increment(email, t)
    },
    /** Successful login: resets the (email, IP) counter only, never the per-email cap. */
    clearLogin(email: string, ip: string | undefined): void {
      pairs.delete(pairKey(email, ip))
    },
    /** Tracked keys, for tests. */
    sizes: () => ({ ips: ips.size, pairs: pairs.size, emails: emails.size }),
  }
}

export type AuthLimiter = ReturnType<typeof createAuthLimiter>
