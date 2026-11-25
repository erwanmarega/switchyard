import type { Check } from '@switchyard/plugin-sdk'
import { describe, expect, it } from 'vitest'
import { REDACTED, redactSecrets, sanitizeResult } from '../src/checks/sanitize.js'

const check: Check = { id: 'chk', title: 'Check', run: async () => ({}) as never }
const now = new Date('2026-05-05T10:00:00.000Z')
const TOKEN = 'tok_SECRET_abcdef'

describe('redactSecrets', () => {
  it('redacts every occurrence in strings', () => {
    expect(redactSecrets(`a ${TOKEN} b ${TOKEN}`, [TOKEN])).toBe(`a ${REDACTED} b ${REDACTED}`)
  })

  it('redacts in nested objects, arrays and object keys', () => {
    const out = redactSecrets({ [`k_${TOKEN}`]: [{ deep: `x${TOKEN}` }, TOKEN], n: 1, ok: true }, [
      TOKEN,
    ])
    expect(out).toEqual({ [`k_${REDACTED}`]: [{ deep: `x${REDACTED}` }, REDACTED], n: 1, ok: true })
    expect(JSON.stringify(out)).not.toContain(TOKEN)
  })

  it('ignores secrets shorter than 4 characters', () => {
    expect(redactSecrets('abc and ab', ['abc', 'ab', ''])).toBe('abc and ab')
    expect(redactSecrets('abcd', ['abcd'])).toBe(REDACTED)
  })

  it('redacts the longest secret first when secrets overlap', () => {
    expect(redactSecrets('xx secret-long-value yy', ['secret', 'secret-long-value'])).toBe(
      `xx ${REDACTED} yy`,
    )
  })

  it('does not throw on cycles and drops the cyclic reference', () => {
    const a: Record<string, unknown> = { name: 'a' }
    a.self = a
    expect(redactSecrets(a, [TOKEN])).toEqual({ name: 'a' })
  })

  it('does not throw on very deep nesting', () => {
    let deep: Record<string, unknown> = { leaf: TOKEN }
    for (let i = 0; i < 5000; i++) deep = { next: deep }
    const out = redactSecrets(deep, [TOKEN])
    expect(JSON.stringify(out)).not.toContain(TOKEN)
  })

  it('drops non-JSON values', () => {
    const out = redactSecrets(
      {
        u: undefined,
        f: () => 1,
        s: Symbol('x'),
        b: 10n,
        nan: Number.NaN,
        inf: Infinity,
        date: new Date(),
        map: new Map(),
        keep: 'yes',
        arr: [undefined, 1],
      },
      [],
    )
    expect(out).toEqual({ keep: 'yes', arr: [null, 1] })
  })

  it('returns undefined when the whole value is dropped', () => {
    expect(redactSecrets(undefined, [])).toBeUndefined()
  })

  it('drops values behind throwing getters instead of failing', () => {
    const hostile = {
      get boom(): string {
        throw new Error('nope')
      },
      ok: 1,
    }
    expect(() => redactSecrets(hostile, [])).not.toThrow()
  })

  it('keeps a __proto__ key as an own property without polluting the prototype', () => {
    const out = redactSecrets(JSON.parse('{"__proto__": {"polluted": true}}'), []) as object
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('redactSecrets derived forms', () => {
  const secret = 'p@ss w/rd+"q"\\é>>??>?'
  const forms: [string, string][] = [
    ['raw', secret],
    ['URL-encoded', encodeURIComponent(secret)],
    ['JSON-escaped', JSON.stringify(secret).slice(1, -1)],
    ['base64', Buffer.from(secret).toString('base64')],
    ['base64url', Buffer.from(secret).toString('base64url')],
  ]

  it.each(forms)('redacts the %s form', (_name, form) => {
    expect(form).not.toBe('')
    expect(redactSecrets(`before ${form} after`, [secret])).toBe(`before ${REDACTED} after`)
    expect(redactSecrets({ [form]: form }, [secret])).toEqual({ [REDACTED]: REDACTED })
  })

  it('uses forms that differ from each other for this secret', () => {
    expect(new Set(forms.map(([, f]) => f)).size).toBe(forms.length)
  })

  it('does not derive forms from secrets shorter than 4 characters', () => {
    expect(redactSecrets('YWJj abc', ['abc'])).toBe('YWJj abc')
  })

  it('redacts the longest form first (a form containing another)', () => {
    const s = 'abcd'
    expect(redactSecrets(`${s} ${Buffer.from(s).toString('base64')}`, [s])).toBe(
      `${REDACTED} ${REDACTED}`,
    )
  })
})

describe('sanitizeResult well-formedness', () => {
  it('removes NUL and replaces lone surrogates in message, values and keys', () => {
    const r = sanitizeResult(
      { status: 'ok', message: 'a\u0000b\ud800', details: { 'k\u0000\udc00': 'v\u0000\ud800' } },
      check,
      [],
      now,
    )
    expect(r.message).toBe('ab\ufffd')
    expect(r.details).toEqual({ 'k\ufffd': 'v\ufffd' })
  })

  it('removes a NUL produced by redaction boundaries', () => {
    const r = sanitizeResult(
      { status: 'ok', message: `x\u0000${TOKEN}\u0000y` },
      check,
      [TOKEN],
      now,
    )
    expect(r.message).toBe(`x${REDACTED}y`)
  })

  it('does not split a surrogate pair when truncating the message', () => {
    const message = 'x'.repeat(1999) + '😀'
    const r = sanitizeResult({ status: 'ok', message }, check, [], now)
    expect(r.message.length).toBeLessThanOrEqual(2000)
    expect(r.message.isWellFormed()).toBe(true)
    expect(r.message).not.toContain('\ud83d')
  })

  it('drops details with too many elements', () => {
    const r = sanitizeResult(
      { status: 'ok', message: 'm', details: { list: Array.from({ length: 600 }, () => 0) } },
      check,
      [],
      now,
    )
    expect(r.details).toEqual({ truncated: true })
  })
})

describe('sanitizeResult', () => {
  it('forces checkId to the check id and checkedAt to the runner time', () => {
    const r = sanitizeResult(
      { checkId: 'evil', status: 'ok', message: 'fine', checkedAt: '1999-01-01T00:00:00Z' },
      check,
      [],
      now,
    )
    expect(r).toEqual({
      checkId: 'chk',
      status: 'ok',
      message: 'fine',
      details: null,
      checkedAt: now.toISOString(),
    })
  })

  it.each(['ok', 'warning', 'error', 'unknown'])('keeps valid status %s', (status) => {
    expect(sanitizeResult({ status, message: 'm' }, check, [], now).status).toBe(status)
  })

  it.each([['fatal'], [42], [null], [undefined], ['OK']])(
    'maps invalid status %j to unknown',
    (s) => {
      expect(sanitizeResult({ status: s, message: 'm' }, check, [], now).status).toBe('unknown')
    },
  )

  it('truncates the message to 2000 characters', () => {
    const r = sanitizeResult({ status: 'ok', message: 'x'.repeat(5000) }, check, [], now)
    expect(r.message).toHaveLength(2000)
  })

  it.each([[42], [''], [null], [undefined], [{}]])(
    'falls back for a non-string or empty message %j',
    (message) => {
      expect(sanitizeResult({ status: 'ok', message }, check, [], now).message).toBe(
        'Résultat invalide.',
      )
    },
  )

  it.each([[null], [undefined], ['str'], [42], [[]]])(
    'handles a non-object raw result %j',
    (raw) => {
      expect(sanitizeResult(raw, check, [], now)).toEqual({
        checkId: 'chk',
        status: 'unknown',
        message: 'Résultat invalide.',
        details: null,
        checkedAt: now.toISOString(),
      })
    },
  )

  it('redacts secrets in message and details', () => {
    const r = sanitizeResult(
      { status: 'ok', message: `leak ${TOKEN}`, details: { a: [TOKEN] } },
      check,
      [TOKEN],
      now,
    )
    expect(JSON.stringify(r)).not.toContain(TOKEN)
    expect(r.message).toBe(`leak ${REDACTED}`)
    expect(r.details).toEqual({ a: [REDACTED] })
  })

  it('redacts a secret that straddles the message truncation limit', () => {
    const message = 'x'.repeat(1995) + TOKEN
    const r = sanitizeResult({ status: 'ok', message }, check, [TOKEN], now)
    expect(r.message).not.toContain('tok_')
  })

  it('replaces details larger than 8 KB with { truncated: true }', () => {
    const r = sanitizeResult(
      { status: 'ok', message: 'm', details: { big: 'y'.repeat(9000) } },
      check,
      [],
      now,
    )
    expect(r.details).toEqual({ truncated: true })
  })

  it('keeps details under 8 KB', () => {
    const r = sanitizeResult(
      { status: 'ok', message: 'm', details: { small: 'y'.repeat(100) } },
      check,
      [],
      now,
    )
    expect(r.details).toEqual({ small: 'y'.repeat(100) })
  })

  it.each([[[1, 2]], ['str'], [5]])('ignores non-object details %j', (details) => {
    expect(
      sanitizeResult({ status: 'ok', message: 'm', details }, check, [], now).details,
    ).toBeNull()
  })

  it('does not throw when reading fields throws', () => {
    const raw = {
      get status(): string {
        throw new Error('x')
      },
    }
    expect(sanitizeResult(raw, check, [], now).status).toBe('unknown')
  })
})
