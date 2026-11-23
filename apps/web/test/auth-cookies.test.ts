import { describe, it, expect } from 'vitest'
import {
  SESSION_MAX_AGE_SECONDS,
  dropRemovalOnlyWrites,
  isSupabaseCookie,
  sessionCookieOptions,
} from '../server/utils/auth-cookies'

describe('sessionCookieOptions', () => {
  it('forces HttpOnly, SameSite=Lax and path / whatever is requested', () => {
    const options = sessionCookieOptions(
      { httpOnly: false, sameSite: 'none', path: '/x', domain: 'a.test' },
      true,
    )
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' })
  })

  it('is Secure in production and not in development', () => {
    expect(sessionCookieOptions({}, true).secure).toBe(true)
    expect(sessionCookieOptions({}, false).secure).toBe(false)
  })

  it('caps the lifetime but keeps removals', () => {
    expect(sessionCookieOptions({ maxAge: 400 * 86400 }, true).maxAge).toBe(SESSION_MAX_AGE_SECONDS)
    expect(sessionCookieOptions(undefined, true).maxAge).toBe(SESSION_MAX_AGE_SECONDS)
    expect(sessionCookieOptions({ maxAge: 60 }, true).maxAge).toBe(60)
    expect(sessionCookieOptions({ maxAge: 0 }, true).maxAge).toBe(0)
  })
})

describe('isSupabaseCookie', () => {
  it('matches sb-* cookies only', () => {
    expect(isSupabaseCookie('sb-127-auth-token')).toBe(true)
    expect(isSupabaseCookie('sb-127-auth-token.1')).toBe(true)
    expect(isSupabaseCookie('theme')).toBe(false)
  })
})

describe('dropRemovalOnlyWrites', () => {
  const removal = { name: 'sb-x-auth-token', value: '', options: { maxAge: 0 } }
  const set = { name: 'sb-x-auth-token', value: 'fresh', options: { maxAge: 400 } }

  it('drops a batch made only of removals (failed refresh)', () => {
    expect(dropRemovalOnlyWrites([removal, { ...removal, name: 'sb-x-auth-token.1' }])).toEqual([])
    expect(dropRemovalOnlyWrites([{ name: 'a', value: '', options: {} }])).toEqual([])
  })

  it('keeps a batch that sets cookies, including its stale-chunk removals', () => {
    const batch = [{ ...removal, name: 'sb-x-auth-token.1' }, set]
    expect(dropRemovalOnlyWrites(batch)).toEqual(batch)
  })

  it('keeps an empty batch empty', () => {
    expect(dropRemovalOnlyWrites([])).toEqual([])
  })
})
