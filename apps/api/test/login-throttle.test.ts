import { describe, it, expect } from 'vitest'
import { LoginThrottle } from '../src/auth/login-throttle.js'

describe('LoginThrottle', () => {
  it('blocks after the max failures until the window expires', () => {
    const t = new LoginThrottle(3, 1000)
    for (let i = 0; i < 3; i++) {
      expect(t.isBlocked('a', 0)).toBe(false)
      t.recordFailure('a', 0)
    }
    expect(t.isBlocked('a', 999)).toBe(true)
    expect(t.isBlocked('a', 1000)).toBe(false)
    expect(t.size).toBe(0)
  })

  it('reset clears the counter', () => {
    const t = new LoginThrottle(1, 1000)
    t.recordFailure('a', 0)
    t.reset('a')
    expect(t.isBlocked('a', 1)).toBe(false)
  })

  it('stays bounded, purging expired entries then the oldest', () => {
    const t = new LoginThrottle(5, 1000, 3)
    t.recordFailure('a', 0)
    t.recordFailure('b', 10)
    t.recordFailure('c', 20)
    t.recordFailure('d', 30)
    expect(t.size).toBe(3)
    expect(t.isBlocked('a', 30)).toBe(false)
    // Expired entries are dropped before evicting live ones.
    t.recordFailure('e', 1015)
    expect(t.size).toBeLessThanOrEqual(3)
    for (let i = 0; i < 100; i++) t.recordFailure(`k${i}`, 2000)
    expect(t.size).toBeLessThanOrEqual(3)
  })
})
