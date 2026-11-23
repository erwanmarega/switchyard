import { guardAuthPost } from '../../utils/auth-route'
import { clearSupabaseCookies, useServerSupabase } from '../../utils/supabase'

// Ends the session on this device. The cookies are cleared even if Supabase cannot be reached.
export default defineEventHandler(async (event) => {
  const refused = guardAuthPost(event, { json: false })
  if (refused) return refused
  try {
    await useServerSupabase(event).auth.signOut({ scope: 'local' })
  } catch {
    // Best effort: the local cookies are dropped below regardless.
  }
  clearSupabaseCookies(event)
  return sendNoContent(event)
})
