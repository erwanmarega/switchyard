import { describe, it, expect } from 'vitest'
import {
  checkDeclaredLength,
  isJsonContentType,
  parseCredentials,
  parseJsonObject,
} from '../server/utils/auth-input'

describe('isJsonContentType', () => {
  it('accepts application/json with optional parameters', () => {
    expect(isJsonContentType('application/json')).toBe(true)
    expect(isJsonContentType('Application/JSON; charset=utf-8')).toBe(true)
  })

  it('rejects everything else', () => {
    expect(isJsonContentType(undefined)).toBe(false)
    expect(isJsonContentType('application/x-www-form-urlencoded')).toBe(false)
    expect(isJsonContentType('text/plain')).toBe(false)
    expect(isJsonContentType('application/jsonp')).toBe(false)
  })
})

describe('parseJsonObject', () => {
  it('parses objects only', () => {
    expect(parseJsonObject('{"a":1}')).toEqual({ a: 1 })
    expect(parseJsonObject('[1]')).toBeNull()
    expect(parseJsonObject('"x"')).toBeNull()
    expect(parseJsonObject('null')).toBeNull()
    expect(parseJsonObject('{nope')).toBeNull()
    expect(parseJsonObject(undefined)).toBeNull()
  })

  it('refuses oversized bodies', () => {
    expect(parseJsonObject(JSON.stringify({ a: 'x'.repeat(5000) }))).toBeNull()
  })
})

describe('parseCredentials', () => {
  it('trims and lowercases the email', () => {
    expect(parseCredentials({ email: '  Foo@Example.COM ', password: 'x' }, 'login')).toEqual({
      ok: true,
      email: 'foo@example.com',
      password: 'x',
    })
  })

  it('rejects missing, non-string or malformed fields', () => {
    for (const body of [
      null,
      {},
      { email: 'a@b.c' },
      { email: 1, password: 'x' },
      { email: 'a@b.c', password: ['x'] },
      { email: 'not-an-email', password: 'x' },
      { email: '   ', password: 'x' },
    ]) {
      expect(parseCredentials(body as Record<string, unknown> | null, 'login').ok).toBe(false)
    }
  })

  it('limits the email to 254 characters', () => {
    const long = `${'a'.repeat(252)}@b.c`
    expect(parseCredentials({ email: long, password: 'x' }, 'login').ok).toBe(false)
    const max = `${'a'.repeat(250)}@b.c`
    expect(max.length).toBe(254)
    expect(parseCredentials({ email: max, password: 'x' }, 'login').ok).toBe(true)
  })

  it('login accepts passwords of 1 to 128 characters', () => {
    expect(parseCredentials({ email: 'a@b.c', password: '' }, 'login').ok).toBe(false)
    expect(parseCredentials({ email: 'a@b.c', password: 'x' }, 'login').ok).toBe(true)
    expect(parseCredentials({ email: 'a@b.c', password: 'x'.repeat(128) }, 'login').ok).toBe(true)
    expect(parseCredentials({ email: 'a@b.c', password: 'x'.repeat(129) }, 'login').ok).toBe(false)
  })

  it('signup requires 10 to 128 characters', () => {
    expect(parseCredentials({ email: 'a@b.c', password: 'x'.repeat(9) }, 'register').ok).toBe(false)
    expect(parseCredentials({ email: 'a@b.c', password: 'x'.repeat(10) }, 'register').ok).toBe(true)
    expect(parseCredentials({ email: 'a@b.c', password: 'x'.repeat(129) }, 'register').ok).toBe(
      false,
    )
  })
})

describe('checkDeclaredLength', () => {
  it('requires a valid Content-Length (411)', () => {
    for (const bad of [undefined, '', 'abc', '-1', '1.5']) {
      expect(checkDeclaredLength(bad, 4096)).toMatchObject({ ok: false, status: 411 })
    }
  })

  it('refuses bodies over the cap (413) and accepts the rest', () => {
    expect(checkDeclaredLength('4097', 4096)).toMatchObject({ ok: false, status: 413 })
    expect(checkDeclaredLength('4096', 4096)).toEqual({ ok: true })
    expect(checkDeclaredLength('0', 4096)).toEqual({ ok: true })
  })
})
