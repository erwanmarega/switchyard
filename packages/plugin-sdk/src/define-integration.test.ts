import { describe, it, expect } from 'vitest'
import { defineIntegration } from './define-integration.js'
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
})
