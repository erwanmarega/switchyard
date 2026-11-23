/**
 * Returns `target` when it is a safe same-origin relative path, otherwise `fallback`.
 * Safe means: a string starting with a single "/" (not "//"), no backslash and no
 * control characters (which browsers may normalise into a protocol-relative URL).
 */
export function safeRedirect(target: unknown, fallback = '/dashboard'): string {
  if (typeof target !== 'string') return fallback
  if (!target.startsWith('/') || target.startsWith('//')) return fallback
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(target)) return fallback
  return target
}
