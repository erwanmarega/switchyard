import { describe, expect, it } from 'vitest'
import {
  effectiveOrigin,
  isRequestOriginAllowed,
  parsePublicOrigin,
} from '../server/utils/origin-check'

const requestOrigin = 'http://localhost:3000'
const check = (input: { method?: string; secFetchSite?: string; origin?: string }) =>
  isRequestOriginAllowed({ method: 'POST', requestOrigin, ...input } as never)

describe('isRequestOriginAllowed', () => {
  it('never blocks safe methods', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'get']) {
      expect(check({ method, secFetchSite: 'cross-site', origin: 'https://evil.example' })).toBe(
        true,
      )
    }
  })

  it('lets non-browser clients (no Sec-Fetch-Site, no Origin) through', () => {
    expect(check({})).toBe(true)
  })

  it('accepts same-origin browser requests', () => {
    expect(check({ secFetchSite: 'same-origin', origin: requestOrigin })).toBe(true)
  })

  it('rejects a non-same-origin Sec-Fetch-Site', () => {
    for (const secFetchSite of ['cross-site', 'same-site', 'none']) {
      expect(check({ secFetchSite })).toBe(false)
    }
  })

  it('rejects a foreign, malformed or opaque Origin', () => {
    expect(check({ origin: 'https://evil.example' })).toBe(false)
    expect(check({ origin: 'http://localhost:3001' })).toBe(false)
    expect(check({ origin: 'https://localhost:3000' })).toBe(false)
    expect(check({ origin: 'null' })).toBe(false)
    expect(check({ origin: 'garbage' })).toBe(false)
  })

  it('applies to PUT, PATCH and DELETE too', () => {
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      expect(check({ method, origin: 'https://evil.example' })).toBe(false)
    }
  })
})

describe('parsePublicOrigin / effectiveOrigin', () => {
  it('accepts a bare origin and normalizes it', () => {
    expect(parsePublicOrigin('https://switchyard.example.com')).toBe(
      'https://switchyard.example.com',
    )
    expect(parsePublicOrigin(' https://a.example.com/ ')).toBe('https://a.example.com')
    expect(parsePublicOrigin('http://localhost:3000')).toBe('http://localhost:3000')
  })

  it('rejects empty values and anything that is not a bare http(s) origin', () => {
    for (const bad of [
      '',
      undefined,
      'example.com',
      'ftp://a.example.com',
      'https://a.example.com/path',
      'https://a.example.com?x=1',
      'https://u:p@a.example.com',
      42,
    ]) {
      expect(parsePublicOrigin(bad)).toBeUndefined()
    }
  })

  it('prefers the configured origin, else the request origin', () => {
    expect(effectiveOrigin('https://app.example.com', 'http://10.0.0.2:3000')).toBe(
      'https://app.example.com',
    )
    expect(effectiveOrigin('', 'http://10.0.0.2:3000')).toBe('http://10.0.0.2:3000')
    expect(effectiveOrigin('nonsense', 'http://10.0.0.2:3000')).toBe('http://10.0.0.2:3000')
  })

  it('checks Origin against the configured public origin', () => {
    const requestOrigin = effectiveOrigin('https://app.example.com', 'http://10.0.0.2:3000')
    expect(
      isRequestOriginAllowed({
        method: 'POST',
        secFetchSite: 'same-origin',
        origin: 'https://app.example.com',
        requestOrigin,
      }),
    ).toBe(true)
    expect(
      isRequestOriginAllowed({
        method: 'POST',
        secFetchSite: undefined,
        origin: 'http://10.0.0.2:3000',
        requestOrigin,
      }),
    ).toBe(false)
  })
})
