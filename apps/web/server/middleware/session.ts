import { isSupabaseCookie } from '../utils/auth-cookies'
import { resolveSession } from '../utils/supabase'

const SKIPPED_PREFIXES = ['/api/', '/auth/', '/_nuxt/', '/__nuxt', '/_ipx/']

// Resolves the session before a page renders, so an expired access token is refreshed and the new
// HttpOnly cookies ride on the page response. The SSR plugin then reads the result from the
// event context. Requests without a Supabase cookie skip it (anonymous visitors, assets).
export default defineEventHandler(async (event) => {
  const path = event.path.split('?')[0]!
  if (event.method !== 'GET' && event.method !== 'HEAD') return
  if (SKIPPED_PREFIXES.some((prefix) => path.startsWith(prefix))) return
  if (!Object.keys(parseCookies(event)).some(isSupabaseCookie)) return
  event.context.authUser = (await resolveSession(event)).user
})
