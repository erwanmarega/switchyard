import { checkProxyBody } from '../utils/body-limit'
import {
  buildUpstreamHeaders,
  parseTrustedProxyHops,
  resolveClientIp,
} from '../utils/forward-headers'
import { effectiveOrigin, isRequestOriginAllowed } from '../utils/origin-check'
import { buildProxyTarget } from '../utils/proxy-target'
import { resolveSession } from '../utils/supabase'

const PAYLOAD_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Same-origin proxy to the Switchyard API: the browser only talks to this app, so no CORS
// configuration is needed. The Supabase session lives in cookies that are never forwarded: the
// proxy turns it into a Bearer access token, which the API verifies on its own.
export default defineEventHandler(async (event) => {
  if (
    !isRequestOriginAllowed({
      method: event.method,
      secFetchSite: getRequestHeader(event, 'sec-fetch-site'),
      origin: getRequestHeader(event, 'origin'),
      requestOrigin: effectiveOrigin(
        useRuntimeConfig(event).publicOrigin,
        getRequestURL(event).origin,
      ),
    })
  ) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  const { apiBase, trustedProxyHops } = useRuntimeConfig(event)
  if (PAYLOAD_METHODS.has(event.method)) {
    const size = checkProxyBody(
      getRequestHeader(event, 'content-length'),
      getRequestHeader(event, 'transfer-encoding'),
    )
    if (!size.ok) {
      throw createError({
        statusCode: size.status,
        statusMessage: size.status === 411 ? 'Length Required' : 'Payload Too Large',
      })
    }
  }
  const path = getRouterParam(event, 'path') ?? ''
  const search = getRequestURL(event).search
  const target = buildProxyTarget(apiBase, path, search)
  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  // Verifies the session; an expired access token is refreshed and the new HttpOnly cookies are
  // set on the event's response here, before sendProxy, which keeps headers already set.
  const { accessToken } = await resolveSession(event)
  // Only an allowlist of headers goes upstream. `x-forwarded-for` is always rebuilt from the
  // resolved client IP (or omitted), and `authorization` never comes from the incoming request.
  const headers = buildUpstreamHeaders({
    incoming: getRequestHeaders(event),
    accessToken,
    clientIp: resolveClientIp({
      socketIp: getRequestIP(event),
      forwardedFor: getRequestHeader(event, 'x-forwarded-for'),
      trustedProxyHops: parseTrustedProxyHops(trustedProxyHops),
    }),
  })

  const body = (
    PAYLOAD_METHODS.has(event.method)
      ? await readRawBody(event, false).catch(() => undefined)
      : undefined
  ) as BodyInit | undefined
  return sendProxy(event, target, { fetchOptions: { method: event.method, body, headers } })
})
