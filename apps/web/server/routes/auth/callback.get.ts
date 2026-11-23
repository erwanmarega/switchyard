import { CONFIRMATION_ERROR_PATH, callbackCode, callbackTarget } from '../../utils/auth-callback'
import { useServerSupabase } from '../../utils/supabase'

// Landing point of the e-mail confirmation link: exchanges the one-time `code` for a session
// (HttpOnly cookies) and redirects to the app. Any failure goes back to the login page.
export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'private, no-store')
  const query = getQuery(event)
  const code = callbackCode(query.code)
  if (code) {
    try {
      const { error } = await useServerSupabase(event).auth.exchangeCodeForSession(code)
      if (!error) return sendRedirect(event, callbackTarget(query.next), 302)
    } catch {
      // Falls through to the error redirect.
    }
  }
  return sendRedirect(event, CONFIRMATION_ERROR_PATH, 302)
})
