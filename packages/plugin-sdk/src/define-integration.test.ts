import { describe, it, expect } from 'vitest'
import { defineIntegration } from './define-integration.js'
import { credentialPattern } from './pattern.js'
import type { Check, Integration } from './types.js'

const check = (id: string): Check => ({
  id,
  title: id,
  run: async () => ({
    checkId: id,
    status: 'ok',
    message: 'ok',
    checkedAt: new Date().toISOString(),
  }),
})

const base = (overrides: Partial<Integration> = {}): Integration => ({
  id: 'demo',
  name: 'Demo',
  credentialsSchema: [{ key: 'token', label: 'Token', secret: true }],
  checks: [check('a'), check('b')],
  ...overrides,
})

describe('defineIntegration', () => {
  it('returns a frozen integration', () => {
    const integration = defineIntegration(base())
    expect(Object.isFrozen(integration)).toBe(true)
    expect(Object.isFrozen(integration.checks)).toBe(true)
    expect(Object.isFrozen(integration.credentialsSchema)).toBe(true)
    expect(integration.checks.map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('rejects an empty id', () => {
    expect(() => defineIntegration(base({ id: '  ' }))).toThrow(/id must not be empty/)
  })

  it('rejects duplicate check ids', () => {
    expect(() => defineIntegration(base({ checks: [check('a'), check('a')] }))).toThrow(
      /duplicate check id "a"/,
    )
  })

  it('rejects an empty check id', () => {
    expect(() => defineIntegration(base({ checks: [check('')] }))).toThrow(/check id/)
  })

  describe('credential fields', () => {
    const field = (over: Partial<Integration['credentialsSchema'][number]> = {}) =>
      base({ credentialsSchema: [{ key: 'id', label: 'Id', secret: false, ...over }] })

    it('accepts optional and pattern on a non-secret field', () => {
      const i = defineIntegration(field({ optional: true, pattern: '[a-z]+' }))
      expect(i.credentialsSchema[0]!.optional).toBe(true)
    })

    it('rejects an invalid pattern', () => {
      expect(() => defineIntegration(field({ pattern: '(' }))).toThrow(/invalid pattern/)
    })

    it('rejects a pattern longer than 200 characters', () => {
      expect(() => defineIntegration(field({ pattern: 'a'.repeat(201) }))).toThrow(/too long/)
      expect(() => defineIntegration(field({ pattern: 'a'.repeat(200) }))).not.toThrow()
    })

    it.each(['(a)\\1', '(?<n>a)\\k<n>', '(a+)+', '(\\w*)*', '(a|b+){2,}', '((a*)b)+', '(?:a+)*'])(
      'rejects the unsafe pattern %s',
      (pattern) => {
        expect(() => defineIntegration(field({ pattern }))).toThrow(/invalid pattern/)
      },
    )

    it.each(['[a-z0-9-]{1,50}', '(ab)+', '(a|b)*', '[(+*]+', 'a+b*\\+', '(a+)b', '(?:ab){2}'])(
      'accepts the linear pattern %s',
      (pattern) => {
        expect(() => defineIntegration(field({ pattern }))).not.toThrow()
      },
    )

    it('caches the compiled pattern per field', () => {
      const i = defineIntegration(field({ pattern: '[a-z]+' }))
      const f = i.credentialsSchema[0]!
      expect(credentialPattern(f)).toBe(credentialPattern(f))
      expect(credentialPattern(f)!.test('abc')).toBe(true)
      expect(credentialPattern(f)!.test('abc1')).toBe(false)
    })

    it('rejects a pattern on a secret field', () => {
      expect(() => defineIntegration(field({ secret: true, pattern: '.+' }))).toThrow(
        /secret field cannot have a pattern/,
      )
    })

    it('rejects an optional secret field', () => {
      expect(() => defineIntegration(field({ secret: true, optional: true }))).toThrow(
        /cannot be optional/,
      )
    })

    it.each(['', '1a', 'a-b', 'a b', 'a'.repeat(65)])('rejects the key %j', (key) => {
      expect(() => defineIntegration(field({ key }))).toThrow(/invalid key/)
    })

    it('rejects duplicate keys', () => {
      expect(() =>
        defineIntegration(
          base({
            credentialsSchema: [
              { key: 'a', label: 'A', secret: false },
              { key: 'a', label: 'A2', secret: true },
            ],
          }),
        ),
      ).toThrow(/duplicate key/)
    })
  })

  describe('allowedHosts', () => {
    it('accepts and freezes valid hosts', () => {
      const i = defineIntegration(base({ allowedHosts: ['api.vercel.com', 'example.test'] }))
      expect(i.allowedHosts).toEqual(['api.vercel.com', 'example.test'])
      expect(Object.isFrozen(i.allowedHosts)).toBe(true)
    })

    it.each([
      'https://a.test',
      'a.test:443',
      'a.test/path',
      '*.a.test',
      'A.test',
      '',
      'a..test',
      '-a.test',
      'user@a.test',
      '127.0.0.1',
      '1.2.3.4',
      '0x7f.0.0.1',
      '0x7f',
      '2130706433',
      '0177.0.0.1',
      'localhost',
      'foo.localhost',
      'intranet',
      'a.test1',
      'a.t',
      'a.123',
    ])('rejects %j', (host) => {
      expect(() => defineIntegration(base({ allowedHosts: [host] }))).toThrow(
        /invalid allowed host/,
      )
    })

    it('rejects duplicates', () => {
      expect(() => defineIntegration(base({ allowedHosts: ['a.test', 'a.test'] }))).toThrow(
        /duplicate allowed host/,
      )
    })
  })

  describe('allowedMethods', () => {
    it('accepts and freezes valid methods', () => {
      const i = defineIntegration(base({ allowedMethods: ['GET', 'POST'] }))
      expect(i.allowedMethods).toEqual(['GET', 'POST'])
      expect(Object.isFrozen(i.allowedMethods)).toBe(true)
    })

    it('rejects unknown, lowercase and duplicate methods', () => {
      expect(() => defineIntegration(base({ allowedMethods: ['TRACE' as never] }))).toThrow(
        /invalid allowed method/,
      )
      expect(() => defineIntegration(base({ allowedMethods: ['get' as never] }))).toThrow(
        /invalid allowed method/,
      )
      expect(() => defineIntegration(base({ allowedMethods: ['GET', 'GET'] }))).toThrow(
        /duplicate allowed method/,
      )
    })
  })
})
