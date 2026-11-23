export interface AuthUser {
  id: string
  email: string
}

interface ApiErrorBody {
  error?: string
  issues?: { path: string; message: string }[]
}

/** Extracts a French, user-facing message from a failed API call. */
export function apiErrorMessage(err: unknown): string {
  const data = (err as { data?: ApiErrorBody } | null)?.data
  if (data?.error) {
    const details = data.issues?.map((i) => i.message).filter(Boolean) ?? []
    return details.length ? `${data.error} ${details.join(' ')}` : data.error
  }
  return 'Impossible de joindre le serveur. Réessayez dans un instant.'
}

/** True when a failed API call was rejected because the session is missing or expired. */
export function isUnauthorized(err: unknown): boolean {
  const e = err as { statusCode?: number; status?: number; response?: { status?: number } } | null
  return (e?.statusCode ?? e?.status ?? e?.response?.status) === 401
}

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

  /** Loads the current session user. On SSR the incoming cookie is forwarded. */
  async function fetchUser(): Promise<AuthUser | null> {
    if (import.meta.server && !useRequestHeaders(['cookie']).cookie?.includes('sy_session=')) {
      user.value = null
      return null
    }
    const request = import.meta.server ? useRequestFetch() : $fetch
    try {
      const res = await request<{ user: AuthUser }>('/api/auth/me')
      user.value = res.user
    } catch {
      user.value = null
    }
    return user.value
  }

  async function authenticate(path: 'login' | 'register', email: string, password: string) {
    const res = await $fetch<{ user: AuthUser }>(`/api/auth/${path}`, {
      method: 'POST',
      body: { email, password },
    })
    user.value = res.user
    return res.user
  }

  const login = (email: string, password: string) => authenticate('login', email, password)
  const register = (email: string, password: string) => authenticate('register', email, password)

  async function logout(): Promise<void> {
    try {
      await $fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      user.value = null
    }
  }

  return { user, fetchUser, login, register, logout, handleUnauthorized }
}
