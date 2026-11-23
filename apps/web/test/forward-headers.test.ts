import { describe, it, expect } from 'vitest'
import { filterForwardHeaders, resolveClientIp } from '../server/utils/forward-headers'

describe('filterForwardHeaders', () => {
  it('keeps only allowlisted headers', () => {
    const out = filterForwardHeaders({
      cookie: 'sy_session=abc',
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
      cookie: 'sy_session=abc',
      'content-type': 'application/json',
      origin: 'http://localhost:3000',
      'user-agent': 'ua',
      accept: '*/*',
      'accept-language': 'fr',
    })
  })

  it('joins repeated headers and skips missing ones', () => {
    expect(filterForwardHeaders({ accept: ['a', 'b'], cookie: undefined })).toEqual({
      accept: 'a, b',
    })
  })
})

describe('resolveClientIp', () => {
  it('drops a spoofed X-Forwarded-For when the front proxy is not trusted', () => {
    expect(
      resolveClientIp({ socketIp: '203.0.113.9', forwardedFor: '6.6.6.6', trustFrontProxy: false }),
    ).toBe('203.0.113.9')
  })

  it('returns undefined (header removed) without a socket address and no trust', () => {
    expect(
      resolveClientIp({ socketIp: undefined, forwardedFor: '6.6.6.6', trustFrontProxy: false }),
    ).toBeUndefined()
  })

  it('uses the left-most entry when the front proxy is trusted', () => {
    expect(
      resolveClientIp({
        socketIp: '10.0.0.2',
        forwardedFor: ' 198.51.100.4 , 10.0.0.1',
        trustFrontProxy: true,
      }),
    ).toBe('198.51.100.4')
  })

  it('falls back to the socket when trusted but the header is absent or empty', () => {
    expect(
      resolveClientIp({ socketIp: '10.0.0.2', forwardedFor: undefined, trustFrontProxy: true }),
    ).toBe('10.0.0.2')
    expect(
      resolveClientIp({ socketIp: '10.0.0.2', forwardedFor: ' ', trustFrontProxy: true }),
    ).toBe('10.0.0.2')
  })
})
