import { describe, it, expect } from 'vitest'
import { buildProxyTarget } from '../server/utils/proxy-target'

describe('buildProxyTarget', () => {
  it('maps the catch-all path under /api on the upstream', () => {
    expect(buildProxyTarget('http://127.0.0.1:3001', 'auth/me')).toBe(
      'http://127.0.0.1:3001/api/auth/me',
    )
  })

  it('tolerates a trailing slash on the base and keeps the query string', () => {
    expect(buildProxyTarget('http://api:3001/', 'integrations', '?a=1')).toBe(
      'http://api:3001/api/integrations?a=1',
    )
  })

  it.each(['', '/', '../health', 'auth/../../health', 'a/%2e%2e/b', 'a%2fb', 'a\\b', './x'])(
    'rejects unsafe path %j',
    (path) => {
      expect(buildProxyTarget('http://127.0.0.1:3001', path)).toBeNull()
    },
  )
})
