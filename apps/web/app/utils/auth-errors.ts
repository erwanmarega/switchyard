export const GENERIC_ERROR = 'Impossible de joindre le serveur. Réessayez dans un instant.'
export const INVALID_CREDENTIALS = 'Email ou mot de passe incorrect.'
export const SIGNUP_CLOSED = 'La création de compte est fermée sur cette instance.'
export const CONFIRM_EMAIL_NOTICE = 'Vérifiez votre boîte mail pour confirmer votre compte.'

export const CONFIRMATION_LINK_ERROR = 'Le lien de confirmation est invalide ou a expiré.'

export type AuthContext = 'login' | 'register'

/** A French, user-facing failure of a login/registration attempt. */
export class AuthFlowError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'AuthFlowError'
  }
}

interface SupabaseAuthErrorLike {
  name?: string
  code?: string
  status?: number
}

export const RATE_LIMITED = 'Trop de tentatives. Réessayez dans quelques minutes.'

const COMMON_MESSAGES: Record<string, string> = {
  over_request_rate_limit: RATE_LIMITED,
  over_email_send_rate_limit: 'Trop d’e-mails envoyés. Réessayez dans quelques minutes.',
}

const REGISTER_MESSAGES: Record<string, string> = {
  ...COMMON_MESSAGES,
  user_already_exists: 'Un compte existe déjà avec cette adresse e-mail.',
  email_exists: 'Un compte existe déjà avec cette adresse e-mail.',
  weak_password: 'Mot de passe trop faible : choisissez-en un plus long et moins courant.',
  signup_disabled: SIGNUP_CLOSED,
  email_address_invalid: 'Cette adresse e-mail n’est pas valide.',
  validation_failed: 'Adresse e-mail ou mot de passe invalide.',
}

// Login deliberately reveals nothing about which accounts exist: every credential failure maps to
// the same message. `email_not_confirmed` is only returned by Supabase once the password matched.
const LOGIN_MESSAGES: Record<string, string> = {
  ...COMMON_MESSAGES,
  email_not_confirmed: 'Confirmez votre adresse e-mail avant de vous connecter.',
}

function isNetworkFailure(e: SupabaseAuthErrorLike): boolean {
  return e.name === 'AuthRetryableFetchError' || e.status === 0 || e.status === undefined
}

/** Maps a Supabase Auth error (`AuthError`) to a French message for the given form. */
export function authErrorMessage(err: unknown, context: AuthContext): string {
  const e = (err ?? {}) as SupabaseAuthErrorLike
  const code = typeof e.code === 'string' ? e.code : undefined
  if (code && code in (context === 'login' ? LOGIN_MESSAGES : REGISTER_MESSAGES)) {
    return (context === 'login' ? LOGIN_MESSAGES : REGISTER_MESSAGES)[code]!
  }
  if (isNetworkFailure(e) || (e.status !== undefined && e.status >= 500)) return GENERIC_ERROR
  // Any other 4xx on login (invalid_credentials, user_not_found, ...) is a credential failure.
  return context === 'login' ? INVALID_CREDENTIALS : GENERIC_ERROR
}

export interface AuthErrorResponse {
  status: number
  body: { error: string; code?: string }
}

/**
 * Maps a Supabase Auth error to the HTTP response of the /auth/* routes: a French message, an
 * appropriate status and, for registration only, the known error code (e.g. `signup_disabled`).
 * Login never exposes a code, so it reveals nothing about which accounts exist.
 */
export function authErrorResponse(err: unknown, context: AuthContext): AuthErrorResponse {
  const e = (err ?? {}) as SupabaseAuthErrorLike
  const error = authErrorMessage(err, context)
  if (error === GENERIC_ERROR && (isNetworkFailure(e) || (e.status ?? 0) >= 500)) {
    return { status: 502, body: { error } }
  }
  if (error === RATE_LIMITED || e.status === 429) return { status: 429, body: { error } }
  if (context === 'login') {
    return { status: error === INVALID_CREDENTIALS ? 401 : 403, body: { error } }
  }
  const code = typeof e.code === 'string' && e.code in REGISTER_MESSAGES ? e.code : undefined
  return { status: 422, body: code ? { error, code } : { error } }
}

interface ApiErrorBody {
  error?: string
  issues?: { path: string; message: string }[]
}

/** Extracts a French, user-facing message from a failed login/registration or API call. */
export function apiErrorMessage(err: unknown): string {
  if (err instanceof AuthFlowError) return err.message
  const data = (err as { data?: ApiErrorBody } | null)?.data
  if (data?.error) {
    const details = data.issues?.map((i) => i.message).filter(Boolean) ?? []
    return details.length ? `${data.error} ${details.join(' ')}` : data.error
  }
  return GENERIC_ERROR
}

/** True when a failed API call was rejected because the session is missing or expired. */
export function isUnauthorized(err: unknown): boolean {
  const e = err as { statusCode?: number; status?: number; response?: { status?: number } } | null
  return (e?.statusCode ?? e?.status ?? e?.response?.status) === 401
}
