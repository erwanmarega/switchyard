import { describe, expect, it } from 'vitest'
// @ts-expect-error plain .mjs script without type declarations
import { readEnvValue, withEncryptionKey } from '../../../scripts/sync-supabase-env.mjs'

describe('readEnvValue', () => {
  it('reads plain, quoted and spaced values', () => {
    expect(readEnvValue('A=1\nKEY=abc\n', 'KEY')).toBe('abc')
    expect(readEnvValue('KEY = "abc"\n', 'KEY')).toBe('abc')
    expect(readEnvValue("KEY='abc'", 'KEY')).toBe('abc')
  })

  it('returns an empty string when absent or empty', () => {
    expect(readEnvValue('A=1\n', 'KEY')).toBe('')
    expect(readEnvValue('KEY=\n', 'KEY')).toBe('')
    expect(readEnvValue('KEY=""\n', 'KEY')).toBe('')
    expect(readEnvValue('# KEY=abc\n', 'KEY')).toBe('')
  })
})

describe('withEncryptionKey', () => {
  it('adds a generated key when missing or empty', () => {
    expect(withEncryptionKey('', { A: '1' }, () => 'new')).toEqual({
      A: '1',
      SWITCHYARD_ENCRYPTION_KEY: 'new',
    })
    expect(withEncryptionKey('SWITCHYARD_ENCRYPTION_KEY=\n', {}, () => 'new')).toEqual({
      SWITCHYARD_ENCRYPTION_KEY: 'new',
    })
  })

  it('never overwrites an existing key', () => {
    const entries = { A: '1' }
    expect(withEncryptionKey('SWITCHYARD_ENCRYPTION_KEY=existing\n', entries, () => 'new')).toEqual(
      entries,
    )
  })

  it('generates a 32-byte base64 key by default', () => {
    const out = withEncryptionKey('', {})
    expect(Buffer.from(out.SWITCHYARD_ENCRYPTION_KEY, 'base64')).toHaveLength(32)
  })
})
