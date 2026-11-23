export const MAX_EMAIL_LENGTH = 254
export const MAX_PASSWORD_LENGTH = 128
export const MIN_SIGNUP_PASSWORD_LENGTH = 10
/** Auth payloads are tiny: anything bigger is refused before parsing. */
export const MAX_BODY_BYTES = 4096

export type AuthMode = 'login' | 'register'

export type ParsedCredentials =
  { ok: true; email: string; password: string } | { ok: false; error: string }

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/

/** True for `application/json` (optionally with parameters such as `; charset=utf-8`). */
export function isJsonContentType(header: string | undefined): boolean {
  if (!header) return false
  return header.split(';')[0]!.trim().toLowerCase() === 'application/json'
}

/** Parses a raw request body as a JSON object; null when too large, malformed or not an object. */
export function parseJsonObject(raw: string | undefined): Record<string, unknown> | null {
  if (raw === undefined || raw.length > MAX_BODY_BYTES) return null
  try {
    const value: unknown = JSON.parse(raw)
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/** Validates and normalizes (trim + lowercase) the email and checks the password length. */
export function parseCredentials(
  body: Record<string, unknown> | null,
  mode: AuthMode,
): ParsedCredentials {
  const rawEmail = body?.email
  const password = body?.password
  if (typeof rawEmail !== 'string' || typeof password !== 'string') {
    return { ok: false, error: 'Adresse e-mail ou mot de passe invalide.' }
  }
  const email = rawEmail.trim().toLowerCase()
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH || !EMAIL_SHAPE.test(email)) {
    return { ok: false, error: 'Cette adresse e-mail n’est pas valide.' }
  }
  const min = mode === 'register' ? MIN_SIGNUP_PASSWORD_LENGTH : 1
  if (password.length < min || password.length > MAX_PASSWORD_LENGTH) {
    return {
      ok: false,
      error:
        mode === 'register'
          ? `Le mot de passe doit contenir entre ${MIN_SIGNUP_PASSWORD_LENGTH} et ${MAX_PASSWORD_LENGTH} caractères.`
          : 'Adresse e-mail ou mot de passe invalide.',
    }
  }
  return { ok: true, email, password }
}

export type BodyLengthCheck = { ok: true } | { ok: false; status: 411 | 413; error: string }

/**
 * Checks a declared `Content-Length` before the body is read: it must be present and a valid
 * non-negative integer (411 otherwise; a chunked body has none) and not exceed `max` (413).
 */
export function checkDeclaredLength(
  contentLength: string | undefined,
  max: number,
): BodyLengthCheck {
  if (contentLength === undefined || !/^\d+$/.test(contentLength.trim())) {
    return { ok: false, status: 411, error: 'La longueur de la requête est requise.' }
  }
  if (Number(contentLength.trim()) > max) {
    return { ok: false, status: 413, error: 'La requête est trop volumineuse.' }
  }
  return { ok: true }
}
