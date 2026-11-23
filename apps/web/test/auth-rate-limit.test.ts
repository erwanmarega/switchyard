import { describe, it, expect } from 'vitest'
import { createAuthLimiter } from '../server/utils/auth-rate-limit'

function setup(options = {}) {
  let t = 1_000_000
  const limiter = createAuthLimiter({ now: () => t, ...options })
  return { limiter, advance: (ms: number) => (t += ms) }
}

describe('auth limiter (per IP)', () => {
  it('allows 10 attempts per minute then refuses with a retry delay', () => {
    const { limiter } = setup()
    for (let i = 0; i < 10; i++) expect(limiter.hitIp('login', '1.1.1.1').allowed).toBe(true)
    const refused = limiter.hitIp('login', '1.1.1.1')
    expect(refused.allowed).toBe(false)
    expect(refused.retryAfterSeconds).toBeGreaterThan(0)
    expect(refused.retryAfterSeconds).toBeLessThanOrEqual(60)
  })

  it('tracks IPs and scopes independently, and resets after the window', () => {
    const { limiter, advance } = setup({ ipLimit: 1 })
    expect(limiter.hitIp('login', 'a').allowed).toBe(true)
    expect(limiter.hitIp('login', 'a').allowed).toBe(false)
    expect(limiter.hitIp('login', 'b').allowed).toBe(true)
    expect(limiter.hitIp('signup', 'a').allowed).toBe(true)
    advance(60_001)
    expect(limiter.hitIp('login', 'a').allowed).toBe(true)
  })

  it('groups unknown addresses together', () => {
    const { limiter } = setup({ ipLimit: 1 })
    expect(limiter.hitIp('login', undefined).allowed).toBe(true)
    expect(limiter.hitIp('login', undefined).allowed).toBe(false)
  })
})

describe('auth limiter (per email + IP)', () => {
  it('locks an (email, IP) pair after 5 failures for 15 minutes', () => {
    const { limiter, advance } = setup()
    for (let i = 0; i < 4; i++) limiter.recordLoginFailure('a@b.c', '1.1.1.1')
    expect(limiter.checkLogin('a@b.c', '1.1.1.1').allowed).toBe(true)
    limiter.recordLoginFailure('a@b.c', '1.1.1.1')
    const locked = limiter.checkLogin('a@b.c', '1.1.1.1')
    expect(locked.allowed).toBe(false)
    expect(locked.retryAfterSeconds).toBeLessThanOrEqual(900)
    expect(limiter.checkLogin('other@b.c', '1.1.1.1').allowed).toBe(true)
    advance(15 * 60_000 + 1)
    expect(limiter.checkLogin('a@b.c', '1.1.1.1').allowed).toBe(true)
  })

  it('does not lock the owner out from another IP', () => {
    const { limiter } = setup()
    for (let i = 0; i < 5; i++) limiter.recordLoginFailure('a@b.c', '6.6.6.6')
    expect(limiter.checkLogin('a@b.c', '6.6.6.6').allowed).toBe(false)
    expect(limiter.checkLogin('a@b.c', '1.1.1.1').allowed).toBe(true)
  })

  it('a success resets the pair counter only', () => {
    const { limiter } = setup()
    for (let i = 0; i < 5; i++) limiter.recordLoginFailure('a@b.c', '1.1.1.1')
    limiter.clearLogin('a@b.c', '1.1.1.1')
    expect(limiter.checkLogin('a@b.c', '1.1.1.1').allowed).toBe(true)
  })
})

describe('auth limiter (global per email)', () => {
  it('locks an email from every IP after 50 failures in an hour', () => {
    const { limiter, advance } = setup()
    for (let i = 0; i < 50; i++) limiter.recordLoginFailure('a@b.c', `10.0.0.${i}`)
    const locked = limiter.checkLogin('a@b.c', '1.1.1.1')
    expect(locked.allowed).toBe(false)
    expect(locked.retryAfterSeconds).toBeLessThanOrEqual(3600)
    expect(limiter.checkLogin('other@b.c', '1.1.1.1').allowed).toBe(true)
    advance(60 * 60_000 + 1)
    expect(limiter.checkLogin('a@b.c', '1.1.1.1').allowed).toBe(true)
  })

  it('is not reset by a success from one IP', () => {
    const { limiter } = setup()
    for (let i = 0; i < 50; i++) limiter.recordLoginFailure('a@b.c', `10.0.0.${i}`)
    limiter.clearLogin('a@b.c', '10.0.0.1')
    expect(limiter.checkLogin('a@b.c', '10.0.0.1').allowed).toBe(false)
  })
})

describe('auth limiter (memory)', () => {
  it('stays bounded, evicting expired then oldest entries', () => {
    const { limiter, advance } = setup({ maxEntries: 5 })
    for (let i = 0; i < 50; i++) limiter.hitIp('login', `ip-${i}`)
    expect(limiter.sizes().ips).toBeLessThanOrEqual(5)
    for (let i = 0; i < 50; i++) limiter.recordLoginFailure(`u${i}@b.c`, 'ip')
    expect(limiter.sizes().emails).toBeLessThanOrEqual(5)
    expect(limiter.sizes().pairs).toBeLessThanOrEqual(5)
    advance(16 * 60_000)
    limiter.hitIp('login', 'fresh')
    expect(limiter.sizes().ips).toBe(1)
  })
})
