import { createServerClient } from '@supabase/ssr'
import type { H3Event } from 'h3'
import { dropRemovalOnlyWrites, isSupabaseCookie, sessionCookieOptions } from './auth-cookies'

export type ServerSupabase = ReturnType<typeof createServerClient>

export interface SessionUser {
  id: string
  email: string
}

export interface ResolvedSession {
  user: SessionUser | null
  /** Verified access token to forward to the API; null for anonymous visitors. */
  accessToken: string | null
}

declare module 'h3' {
  interface H3EventContext {
    _supabase?: ServerSupabase
    _session?: Promise<ResolvedSession>
    /** Verified user for SSR, set by server/middleware/session.ts (absent without a session). */
    authUser?: SessionUser | null
  }
}

/** `Secure` on every build except `nuxt dev` (plain http://localhost). */
const secureCookies = () => !import.meta.dev

/**
 * Supabase client for this request. Session cookies are read from the request and written to the
 * response (refreshes, sign-in, sign-out) as HttpOnly cookies only: the browser never holds a
 * token. The client is memoized per event, so one request refreshes an expired token once.
 */
export function useServerSupabase(event: H3Event): ServerSupabase {
  return getServerSupabase(event, false)
}

/**
 * Client used to resolve the session of a page or proxied request. A failed refresh (typically a
 * concurrent request that already rotated the same refresh token) makes @supabase/ssr emit
 * removal cookies, which would overwrite the fresh cookies of the winning request and sign the
 * user out. Those removals are dropped: the request is just anonymous. Only logout deletes.
 */
function useSessionSupabase(event: H3Event): ServerSupabase {
  return getServerSupabase(event, true)
}

function getServerSupabase(event: H3Event, ignoreRemovals: boolean): ServerSupabase {
  if (event.context._supabase) return event.context._supabase
  const { supabaseUrl, supabaseKey } = useRuntimeConfig(event)
  if (!supabaseUrl || !supabaseKey) {
    throw createError({ statusCode: 500, statusMessage: 'Supabase is not configured' })
  }
  const client = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => Object.entries(parseCookies(event)).map(([name, value]) => ({ name, value })),
      setAll: (cookies, headers) => {
        const writes = ignoreRemovals ? dropRemovalOnlyWrites(cookies) : cookies
        for (const { name, value, options } of writes) {
          setCookie(event, name, value, sessionCookieOptions(options, secureCookies()))
        }
        // Responses carrying session cookies must not be cached (Cache-Control, Expires, Pragma).
        for (const [key, value] of Object.entries(headers)) setHeader(event, key, value)
      },
    },
  })
  event.context._supabase = client
  return client
}

/** Expires every Supabase cookie the browser sent (used on logout, even when sign-out fails). */
export function clearSupabaseCookies(event: H3Event): void {
  for (const name of Object.keys(parseCookies(event))) {
    if (isSupabaseCookie(name)) {
      setCookie(event, name, '', sessionCookieOptions({ maxAge: 0 }, secureCookies()))
    }
  }
}

/**
 * Resolves who is calling, once per request. The identity comes from `getClaims()`, which
 * verifies the access token's signature (refreshing an expired one and writing the new cookies);
 * the unverified session user is never used. Anonymous Supabase users count as signed out.
 */
export function resolveSession(event: H3Event): Promise<ResolvedSession> {
  event.context._session ??= loadSession(event)
  return event.context._session
}

async function loadSession(event: H3Event): Promise<ResolvedSession> {
  const anonymous: ResolvedSession = { user: null, accessToken: null }
  try {
    const supabase = useSessionSupabase(event)
    const { data, error } = await supabase.auth.getClaims()
    const claims = data?.claims
    if (error || !claims?.sub || claims.is_anonymous || claims.role !== 'authenticated') {
      return anonymous
    }
    // getClaims() has just validated (and, if needed, refreshed) the stored session.
    const { data: stored } = await supabase.auth.getSession()
    return {
      user: { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : '' },
      accessToken: stored.session?.access_token ?? null,
    }
  } catch {
    return anonymous
  }
}
