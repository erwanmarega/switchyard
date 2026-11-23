import { describe, it, expect } from 'vitest'
import { safeRedirect } from '~/utils/safe-redirect'

describe('safeRedirect', () => {
  it('keeps same-origin relative paths', () => {
    expect(safeRedirect('/dashboard')).toBe('/dashboard')
    expect(safeRedirect('/a/b?x=1#h')).toBe('/a/b?x=1#h')
    expect(safeRedirect('/')).toBe('/')
  })

  it.each([
    '//evil.example',
    '/\\evil.example',
    'https://evil.example',
    'javascript:alert(1)',
    'dashboard',
    '',
    '/ok\nbad',
    '/\tevil',
  ])('rejects %j', (value) => {
    expect(safeRedirect(value)).toBe('/dashboard')
  })

  it('rejects non-strings and honours the fallback', () => {
    expect(safeRedirect(undefined)).toBe('/dashboard')
    expect(safeRedirect(['/a'])).toBe('/dashboard')
    expect(safeRedirect(null, '/')).toBe('/')
  })
})
