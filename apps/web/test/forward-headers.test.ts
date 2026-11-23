import { describe, it, expect } from 'vitest'
import {
  buildUpstreamHeaders,
  filterForwardHeaders,
  parseTrustedProxyHops,
  resolveClientIp,
} from '../server/utils/forward-headers'

describe('filterForwardHeaders', () => {
  it('keeps only allowlisted headers', () => {
    const out = filterForwardHeaders({
      cookie: 'sb-x-auth-token=refresh-secret',
      'content-type': 'application/json',
      'content-length': '12',
      origin: 'http://localhost:3000',
      'user-agent': 'ua',
      accept: '*/*',
      'accept-language': 'fr',
      'x-forwarded-for': '6.6.6.6',
      'x-forwarded-host': 'evil',
      'x-forwarded-proto': 'https',
      'x-real-ip': '6.6.6.6',
      forwarded: 'for=6.6.6.6',
      authorization: 'Bearer x',
      host: 'localhost:3000',
      connection: 'keep-alive',
    })
    expect(out).toEqual({
      'content-type': 'application/json',
      origin: 'http://localhost:3000',
      'user-agent': 'ua',
      accept: '*/*',
      'accept-language': 'fr',
    })
  })

  it('joins repeated headers and skips missing ones', () => {
    expect(filterForwardHeaders({ accept: ['a', 'b'], origin: undefined })).toEqual({
      accept: 'a, b',
    })
  })
})

describe('buildUpstreamHeaders', () => {
  const incoming = {
    cookie: 'sb-x-auth-token=refresh-secret',
    authorization: 'Bearer forged',
    accept: 'application/json',
    'x-forwarded-for': '6.6.6.6',
  }

  it('never forwards the incoming cookie or authorization header', () => {
    const out = buildUpstreamHeaders({ incoming })
    expect(out).toEqual({ accept: 'application/json' })
    expect(out).not.toHaveProperty('cookie')
    expect(out).not.toHaveProperty('authorization')
  })

  it('injects the session access token as a Bearer, replacing any incoming value', () => {
    const out = buildUpstreamHeaders({ incoming, accessToken: 'real.access.token' })
    expect(out.authorization).toBe('Bearer real.access.token')
    expect(out).not.toHaveProperty('cookie')
  })

  it('adds no authorization without a token', () => {
    expect(buildUpstreamHeaders({ incoming, accessToken: null })).not.toHaveProperty(
      'authorization',
    )
    expect(buildUpstreamHeaders({ incoming, accessToken: '' })).not.toHaveProperty('authorization')
  })

  it('rebuilds x-forwarded-for from the resolved client IP only', () => {
    expect(buildUpstreamHeaders({ incoming, clientIp: '203.0.113.9' })['x-forwarded-for']).toBe(
      '203.0.113.9',
    )
    expect(buildUpstreamHeaders({ incoming })).not.toHaveProperty('x-forwarded-for')
  })
})

describe('resolveClientIp', () => {
  it('ignores X-Forwarded-For with 0 trusted hops', () => {
    expect(
      resolveClientIp({ socketIp: '203.0.113.9', forwardedFor: '6.6.6.6', trustedProxyHops: 0 }),
    ).toBe('203.0.113.9')
  })

  it('returns undefined without a socket address and no trust', () => {
    expect(
      resolveClientIp({ socketIp: undefined, forwardedFor: '6.6.6.6', trustedProxyHops: 0 }),
    ).toBeUndefined()
  })

  it('takes the right-most entry with one trusted hop, ignoring attacker-supplied ones', () => {
    expect(
      resolveClientIp({
        socketIp: '10.0.0.2',
        forwardedFor: '6.6.6.6, 7.7.7.7, 198.51.100.4',
        trustedProxyHops: 1,
      }),
    ).toBe('198.51.100.4')
  })

  it('takes the N-th entry from the right with N trusted hops', () => {
    expect(
      resolveClientIp({
        socketIp: '10.0.0.3',
        forwardedFor: '6.6.6.6, 198.51.100.4 , 10.0.0.1',
        trustedProxyHops: 2,
      }),
    ).toBe('198.51.100.4')
  })

  it('falls back to the socket address when the header has fewer entries than hops', () => {
    expect(
      resolveClientIp({ socketIp: '10.0.0.2', forwardedFor: '6.6.6.6', trustedProxyHops: 2 }),
    ).toBe('10.0.0.2')
    expect(
      resolveClientIp({ socketIp: '10.0.0.2', forwardedFor: undefined, trustedProxyHops: 1 }),
    ).toBe('10.0.0.2')
    expect(resolveClientIp({ socketIp: '10.0.0.2', forwardedFor: ' ', trustedProxyHops: 1 })).toBe(
      '10.0.0.2',
    )
  })
})

describe('parseTrustedProxyHops', () => {
  it('accepts non-negative integers, as numbers or strings', () => {
    expect(parseTrustedProxyHops(2)).toBe(2)
    expect(parseTrustedProxyHops('1')).toBe(1)
    expect(parseTrustedProxyHops('0')).toBe(0)
  })

  it('falls back to 0 for anything else', () => {
    for (const bad of ['', ' ', '-1', '1.5', 'true', 'abc', undefined, null, NaN, 999]) {
      expect(parseTrustedProxyHops(bad)).toBe(0)
    }
  })
})
