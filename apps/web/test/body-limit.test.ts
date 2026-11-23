import { describe, expect, it } from 'vitest'
import { MAX_PROXY_BODY_BYTES, checkProxyBody } from '../server/utils/body-limit'

describe('checkProxyBody', () => {
  it('accepts bodies within the cap and requests without a body', () => {
    expect(checkProxyBody('10', undefined)).toEqual({ ok: true })
    expect(checkProxyBody(String(MAX_PROXY_BODY_BYTES), undefined)).toEqual({ ok: true })
    expect(checkProxyBody(undefined, undefined)).toEqual({ ok: true })
  })

  it('refuses a declared length over the cap with 413', () => {
    expect(checkProxyBody(String(MAX_PROXY_BODY_BYTES + 1), undefined)).toEqual({
      ok: false,
      status: 413,
    })
  })

  it('refuses a chunked body without length with 411', () => {
    expect(checkProxyBody(undefined, 'chunked')).toEqual({ ok: false, status: 411 })
    expect(checkProxyBody(undefined, 'gzip, Chunked')).toEqual({ ok: false, status: 411 })
  })

  it('refuses an invalid length with 411', () => {
    expect(checkProxyBody('abc', undefined)).toEqual({ ok: false, status: 411 })
  })
})
