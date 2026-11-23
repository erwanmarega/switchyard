import type { setCookie } from 'h3'

type CookieSerializeOptions = NonNullable<Parameters<typeof setCookie>[3]>

/**
 * Max-Age of the session cookies, re-armed on every write (refresh, sign-in): a sliding window of
 * inactivity, NOT an absolute lifetime. A session that keeps refreshing stays alive; bound its
 * total lifetime with the Supabase session time-box (`[auth.sessions] timebox`) and inactivity
 * timeout (`inactivity_timeout`).
 */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8

/**
 * Cookie options for every Supabase session cookie. Whatever @supabase/ssr asks for, the cookies
 * are forced HttpOnly (the browser never reads a token), SameSite=Lax and path `/`; `Secure`
 * everywhere except in development (plain http://localhost). Removals (`maxAge: 0`) are kept.
 */
export function sessionCookieOptions(
  requested: CookieSerializeOptions | undefined,
  secure: boolean,
): CookieSerializeOptions {
  const removal = requested?.maxAge === 0
  return {
    ...requested,
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: removal ? 0 : Math.min(requested?.maxAge ?? Infinity, SESSION_MAX_AGE_SECONDS),
  }
}

/** Supabase session cookies are all named `sb-<project>-auth-token[.<chunk>]` (and PKCE verifier). */
export function isSupabaseCookie(name: string): boolean {
  return name.startsWith('sb-')
}

interface CookieWrite {
  name: string
  value: string
  options: CookieSerializeOptions
}

const isRemoval = (cookie: CookieWrite) => cookie.value === '' || cookie.options?.maxAge === 0

/**
 * Filters the cookie writes of a read-only session resolution. A batch made only of removals
 * (what @supabase/ssr emits after a failed refresh) is dropped entirely, since it could erase the
 * fresh cookies another concurrent request just received. A batch that also sets cookies (a
 * successful refresh, which blanks stale chunks) is kept whole.
 */
export function dropRemovalOnlyWrites<T extends CookieWrite>(cookies: T[]): T[] {
  return cookies.every(isRemoval) ? [] : cookies
}
