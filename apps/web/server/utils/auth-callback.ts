import { safeRedirect } from '../../app/utils/safe-redirect'

export const CONFIRMATION_ERROR_PATH = '/connexion?error=confirmation'

/** Where the confirmation link sends the visitor: a safe relative path, else the dashboard. */
export function callbackTarget(next: unknown): string {
  return safeRedirect(Array.isArray(next) ? next[0] : next, '/dashboard')
}

/** The single-use `code` query value, or undefined when missing, repeated or absurdly long. */
export function callbackCode(code: unknown): string | undefined {
  return typeof code === 'string' && code.length > 0 && code.length <= 512 ? code : undefined
}

/** URL embedded in the confirmation e-mail (`emailRedirectTo`). */
export function callbackUrl(origin: string): string {
  return `${origin}/auth/callback`
}
