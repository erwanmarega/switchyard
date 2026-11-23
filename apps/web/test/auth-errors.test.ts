import { describe, it, expect } from 'vitest'
import { isUnauthorized } from '../app/composables/useAuth'

describe('isUnauthorized', () => {
  it('detects 401 from ofetch errors and responses', () => {
    expect(isUnauthorized({ statusCode: 401 })).toBe(true)
    expect(isUnauthorized({ status: 401 })).toBe(true)
    expect(isUnauthorized({ response: { status: 401 } })).toBe(true)
  })

  it('ignores other failures', () => {
    expect(isUnauthorized({ statusCode: 500 })).toBe(false)
    expect(isUnauthorized(new Error('network'))).toBe(false)
    expect(isUnauthorized(null)).toBe(false)
  })
})
