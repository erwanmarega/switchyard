import { AuthFlowError, apiErrorMessage, isUnauthorized } from '~/utils/auth-errors'

export interface AuthUser {
  id: string
  email: string
}

export type RegisterResult =
  { status: 'signed-in'; user: AuthUser } | { status: 'confirmation-required' }

interface CredentialsResponse {
  user?: AuthUser
  status?: 'confirm_email'
}

/**
 * Session state and actions. The browser never talks to Supabase nor holds its tokens: the
 * session lives in HttpOnly cookies managed by the /auth/* server routes.
 */
export function useAuth() {
  const user = useState<AuthUser | null>('auth-user', () => null)
  const router = useRouter()

  /**
   * Call from data fetches on `/api/*`: on a 401 the cached user is cleared and the visitor is
   * sent to the login page, then brought back to the current path. Returns true when handled.
   */
  function handleUnauthorized(err: unknown): boolean {
    if (!isUnauthorized(err)) return false
    user.value = null
    void navigateTo(`/connexion?redirect=${encodeURIComponent(router.currentRoute.value.fullPath)}`)
    return true
  }

  /**
   * Resolves the current user from a verified source only. On the server this is the user the
   * session middleware validated for this request; in the browser, `GET /auth/session`.
   */
  async function fetchUser(): Promise<AuthUser | null> {
    try {
      if (import.meta.server) {
        user.value = (useRequestEvent()?.context.authUser as AuthUser | null | undefined) ?? null
      } else {
        const data = await $fetch<{ user: AuthUser | null }>('/auth/session', {
          headers: { accept: 'application/json' },
        })
        user.value = data.user
      }
    } catch {
      user.value = null
    }
    return user.value
  }

  async function post(path: string, body: { email: string; password: string }) {
    try {
      return await $fetch<CredentialsResponse>(path, { method: 'POST', body })
    } catch (err) {
      const code = (err as { data?: { code?: string } } | null)?.data?.code
      throw new AuthFlowError(apiErrorMessage(err), code)
    }
  }

  async function login(email: string, password: string): Promise<AuthUser> {
    const data = await post('/auth/login', { email, password })
    if (!data.user) throw new AuthFlowError(apiErrorMessage(null))
    user.value = data.user
    return data.user
  }

  async function register(email: string, password: string): Promise<RegisterResult> {
    const data = await post('/auth/signup', { email, password })
    // No session means email confirmation is required: the visitor is not logged in yet.
    if (!data.user) return { status: 'confirmation-required' }
    user.value = data.user
    return { status: 'signed-in', user: data.user }
  }

  async function logout(): Promise<void> {
    try {
      await $fetch('/auth/logout', { method: 'POST' })
    } finally {
      user.value = null
    }
  }

  return { user, fetchUser, login, register, logout, handleUnauthorized }
}
