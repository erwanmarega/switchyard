import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { TEST_ENV, fakeDb, makeSigner, testApp, testConfig } from './helpers.js'
import { createMemoryStore } from './support/memory-store.js'

describe('check runner config', () => {
  it('defaults to enabled with a 300 s interval', () => {
    const c = loadConfig(TEST_ENV)
    expect(c.CHECKS_ENABLED).toBe(true)
    expect(c.CHECK_INTERVAL_SECONDS).toBe(300)
  })

  it('accepts CHECKS_ENABLED=false and =true', () => {
    expect(loadConfig({ ...TEST_ENV, CHECKS_ENABLED: 'false' }).CHECKS_ENABLED).toBe(false)
    expect(loadConfig({ ...TEST_ENV, CHECKS_ENABLED: 'true' }).CHECKS_ENABLED).toBe(true)
  })

  it.each(['yes', '1', 'TRUE', ''])('rejects CHECKS_ENABLED=%j', (value) => {
    expect(() => loadConfig({ ...TEST_ENV, CHECKS_ENABLED: value })).toThrow(/CHECKS_ENABLED/)
  })

  it.each([
    ['60', 60],
    ['86400', 86400],
    ['900', 900],
  ])('accepts CHECK_INTERVAL_SECONDS=%s', (value, expected) => {
    expect(loadConfig({ ...TEST_ENV, CHECK_INTERVAL_SECONDS: value }).CHECK_INTERVAL_SECONDS).toBe(
      expected,
    )
  })

  it.each(['59', '86401', 'abc', '1.5', '-1', '0'])(
    'rejects CHECK_INTERVAL_SECONDS=%s',
    (value) => {
      expect(() => loadConfig({ ...TEST_ENV, CHECK_INTERVAL_SECONDS: value })).toThrow(
        /CHECK_INTERVAL_SECONDS/,
      )
    },
  )
})

describe('scheduler wiring', () => {
  afterEach(() => vi.restoreAllMocks())

  it('refuses startScheduler with an injected db', () => {
    expect(() =>
      buildApp({
        config: testConfig(),
        db: fakeDb(),
        store: createMemoryStore(),
        startScheduler: true,
      }),
    ).toThrow(/startScheduler/)
  })

  it('never starts a scheduler by default (no interval timer is created)', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const app = testApp(await makeSigner())
    await app.ready()
    await app.close()
    expect(setIntervalSpy).not.toHaveBeenCalled()
  })
})
