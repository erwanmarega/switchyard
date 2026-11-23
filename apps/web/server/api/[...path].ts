import { filterForwardHeaders, resolveClientIp } from '../utils/forward-headers'
import { buildProxyTarget } from '../utils/proxy-target'

const PAYLOAD_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Same-origin proxy to the Switchyard API: the browser only talks to this app, so the
// session cookie stays first-party and no CORS configuration is needed.
export default defineEventHandler(async (event) => {
  const { apiBase, trustFrontProxy } = useRuntimeConfig(event)
  const path = getRouterParam(event, 'path') ?? ''
  const search = getRequestURL(event).search
  const target = buildProxyTarget(apiBase, path, search)
  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  // Only an allowlist of headers goes upstream. `x-forwarded-for` is always rebuilt from the
  // resolved client IP (or omitted), never copied from the incoming request.
  const headers = filterForwardHeaders(getRequestHeaders(event))
  const clientIp = resolveClientIp({
    socketIp: getRequestIP(event),
    forwardedFor: getRequestHeader(event, 'x-forwarded-for'),
    trustFrontProxy: String(trustFrontProxy) === 'true',
  })
  if (clientIp) headers['x-forwarded-for'] = clientIp

  const body = (
    PAYLOAD_METHODS.has(event.method)
      ? await readRawBody(event, false).catch(() => undefined)
      : undefined
  ) as BodyInit | undefined
  return sendProxy(event, target, { fetchOptions: { method: event.method, body, headers } })
})
