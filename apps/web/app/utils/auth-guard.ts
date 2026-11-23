import { safeRedirect } from './safe-redirect'

export type GuardKind = 'auth' | 'guest'

/**
 * Pure routing decision shared by the `auth` and `guest` middlewares.
 * Returns the path to redirect to, or null when navigation may proceed.
 */
export function guardRedirect(
  kind: GuardKind,
  isAuthenticated: boolean,
  fullPath: string,
): string | null {
  if (kind === 'auth') {
    return isAuthenticated ? null : `/connexion?redirect=${encodeURIComponent(fullPath)}`
  }
  return isAuthenticated ? '/dashboard' : null
}

/** Target after a successful login/registration, from the `redirect` query param. */
export function postLoginTarget(redirect: unknown): string {
  return safeRedirect(Array.isArray(redirect) ? redirect[0] : redirect)
}
