import { describe, expect, it } from 'vitest'
import { callbackCode, callbackTarget, callbackUrl } from '../server/utils/auth-callback'

describe('callbackTarget', () => {
  it('defaults to the dashboard', () => {
    expect(callbackTarget(undefined)).toBe('/dashboard')
    expect(callbackTarget('')).toBe('/dashboard')
  })

  it('keeps safe relative paths only', () => {
    expect(callbackTarget('/dashboard/flows?x=1')).toBe('/dashboard/flows?x=1')
    expect(callbackTarget(['/a', '/b'])).toBe('/a')
    for (const bad of ['//evil.example', 'https://evil.example', '/\\evil.example', 'dashboard']) {
      expect(callbackTarget(bad)).toBe('/dashboard')
    }
  })
})

describe('callbackCode', () => {
  it('accepts a plausible code only', () => {
    expect(callbackCode('abc-123')).toBe('abc-123')
    expect(callbackCode(undefined)).toBeUndefined()
    expect(callbackCode('')).toBeUndefined()
    expect(callbackCode(['a', 'b'])).toBeUndefined()
    expect(callbackCode('x'.repeat(513))).toBeUndefined()
  })
})

describe('callbackUrl', () => {
  it('appends the callback path to the origin', () => {
    expect(callbackUrl('https://app.example.com')).toBe('https://app.example.com/auth/callback')
  })
})
