/** Largest request body the /api proxy buffers and forwards. */
export const MAX_PROXY_BODY_BYTES = 1024 * 1024

export type ProxyBodyCheck = { ok: true } | { ok: false; status: 411 | 413 }

/**
 * Checks a payload request before its body is buffered: a body of unknown length (chunked
 * transfer without `Content-Length`) is refused with 411, a declared length over the cap or an
 * invalid one with 413 / 400-like 411. A request with neither header has no body.
 */
export function checkProxyBody(
  contentLength: string | undefined,
  transferEncoding: string | undefined,
  max = MAX_PROXY_BODY_BYTES,
): ProxyBodyCheck {
  if (contentLength === undefined) {
    return transferEncoding?.toLowerCase().includes('chunked')
      ? { ok: false, status: 411 }
      : { ok: true }
  }
  if (!/^\d+$/.test(contentLength.trim())) return { ok: false, status: 411 }
  return Number(contentLength.trim()) > max ? { ok: false, status: 413 } : { ok: true }
}
