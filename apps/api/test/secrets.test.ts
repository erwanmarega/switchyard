import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'
import { createSecretBox, openJson, parseEncryptionKey, sealJson } from '../src/crypto/secrets.js'
import { TEST_ENV } from './helpers.js'

const AAD = 'connection:c1:user:u1'
const PLAINTEXT = 'ghp_super-secret-token'
const key = () => randomBytes(32)

function tamper(sealed: string, part: number): string {
  const parts = sealed.split('.')
  const chars = [...parts[part]!]
  chars[0] = chars[0] === 'A' ? 'B' : 'A'
  parts[part] = chars.join('')
  return parts.join('.')
}

describe('parseEncryptionKey', () => {
  it('accepts 32 bytes of base64', () => {
    const raw = key()
    expect(parseEncryptionKey(raw.toString('base64')).equals(raw)).toBe(true)
  })

  it.each([16, 31, 33])('rejects a %i-byte key', (n) => {
    const value = randomBytes(n).toString('base64')
    expect(() => parseEncryptionKey(value)).toThrow(/32 random bytes/)
    try {
      parseEncryptionKey(value)
    } catch (err) {
      expect((err as Error).message).not.toContain(value)
    }
  })

  it('rejects non-base64 input and missing padding', () => {
    expect(() => parseEncryptionKey('not base64 at all!')).toThrow()
    expect(() => parseEncryptionKey('')).toThrow()
    expect(() => parseEncryptionKey(key().toString('base64').replace(/=+$/, ''))).toThrow()
  })
})

describe('createSecretBox', () => {
  it('round-trips, including empty and unicode text', () => {
    const box = createSecretBox(key())
    for (const text of [PLAINTEXT, '', 'héllo ✓']) {
      expect(box.open(box.seal(text, AAD), AAD)).toBe(text)
    }
  })

  it('uses the v1.iv.tag.ciphertext format with base64url parts', () => {
    const sealed = createSecretBox(key()).seal(PLAINTEXT, AAD)
    const parts = sealed.split('.')
    expect(parts).toHaveLength(4)
    expect(parts[0]).toBe('v1')
    expect(Buffer.from(parts[1]!, 'base64url')).toHaveLength(12)
    expect(Buffer.from(parts[2]!, 'base64url')).toHaveLength(16)
    expect(sealed).not.toMatch(/[=+/]/)
  })

  it('uses a fresh IV for each seal', () => {
    const box = createSecretBox(key())
    const a = box.seal(PLAINTEXT, AAD)
    const b = box.seal(PLAINTEXT, AAD)
    expect(a).not.toBe(b)
    expect(a.split('.')[1]).not.toBe(b.split('.')[1])
  })

  it('rejects a wrong AAD', () => {
    const box = createSecretBox(key())
    expect(() => box.open(box.seal(PLAINTEXT, AAD), 'connection:c2:user:u1')).toThrow(
      'Unable to decrypt secret',
    )
  })

  it('rejects a wrong key', () => {
    const sealed = createSecretBox(key()).seal(PLAINTEXT, AAD)
    expect(() => createSecretBox(key()).open(sealed, AAD)).toThrow('Unable to decrypt secret')
  })

  it('rejects tampered iv, tag and ciphertext', () => {
    const box = createSecretBox(key())
    const sealed = box.seal(PLAINTEXT, AAD)
    for (const part of [1, 2, 3]) {
      expect(() => box.open(tamper(sealed, part), AAD)).toThrow('Unable to decrypt secret')
    }
  })

  it('rejects an unknown version and malformed strings', () => {
    const box = createSecretBox(key())
    const sealed = box.seal(PLAINTEXT, AAD)
    const bad = [
      sealed.replace(/^v1/, 'v2'),
      '',
      'garbage',
      'v1.a.b',
      `${sealed}.extra`,
      sealed.replace(/^v1\.[^.]+/, 'v1.AAAA'),
      sealed.replace(/^(v1\.[^.]+)\.[^.]+/, '$1.AAAA'),
      'v1.!!!.???.***',
    ]
    for (const value of bad) {
      expect(() => box.open(value, AAD)).toThrow('Unable to decrypt secret')
    }
  })

  it('never leaks the plaintext or the key in errors', () => {
    const raw = key()
    const box = createSecretBox(raw)
    const sealed = box.seal(PLAINTEXT, AAD)
    let message = ''
    try {
      box.open(tamper(sealed, 3), AAD)
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toBe('Unable to decrypt secret')
    expect(message).not.toContain(PLAINTEXT)
    expect(message).not.toContain(raw.toString('base64'))
  })

  it('rejects a key of the wrong length', () => {
    expect(() => createSecretBox(randomBytes(16))).toThrow()
  })

  it('is not affected by later mutation of the caller key', () => {
    const raw = key()
    const box = createSecretBox(raw)
    const sealed = box.seal(PLAINTEXT, AAD)
    raw.fill(0)
    expect(box.open(sealed, AAD)).toBe(PLAINTEXT)
  })
})

describe('sealJson / openJson', () => {
  const box = createSecretBox(key())

  it('round-trips a flat string record', () => {
    const value = { access_token: 'a', refresh_token: 'b' }
    expect(openJson(box, sealJson(box, value, AAD), AAD)).toEqual(value)
  })

  it('rejects values that are not a flat object of strings', () => {
    for (const bad of ['[]', '"str"', 'null', '{"a":1}', '{"a":{"b":"c"}}', 'not json']) {
      expect(() => openJson(box, box.seal(bad, AAD), AAD)).toThrow('Unable to decrypt secret')
    }
  })
})

describe('SWITCHYARD_ENCRYPTION_KEY config', () => {
  const withoutKey: Record<string, string> = { ...TEST_ENV }
  delete withoutKey.SWITCHYARD_ENCRYPTION_KEY

  it('loads a valid key as a 32-byte Buffer', () => {
    const config = loadConfig(TEST_ENV)
    expect(Buffer.isBuffer(config.SWITCHYARD_ENCRYPTION_KEY)).toBe(true)
    expect(config.SWITCHYARD_ENCRYPTION_KEY).toHaveLength(32)
  })

  it('requires the key', () => {
    expect(() => loadConfig(withoutKey)).toThrow(/SWITCHYARD_ENCRYPTION_KEY is required/)
    expect(() => loadConfig({ ...withoutKey, SWITCHYARD_ENCRYPTION_KEY: '' })).toThrow(
      /SWITCHYARD_ENCRYPTION_KEY/,
    )
  })

  it('rejects an invalid key without echoing it', () => {
    for (const value of ['sup3r-s3cret-value', randomBytes(16).toString('base64')]) {
      let message = ''
      try {
        loadConfig({ ...withoutKey, SWITCHYARD_ENCRYPTION_KEY: value })
      } catch (err) {
        message = (err as Error).message
      }
      expect(message).toMatch(/SWITCHYARD_ENCRYPTION_KEY/)
      expect(message).not.toContain(value)
    }
  })
})
