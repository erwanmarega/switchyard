import { authErrorResponse } from '../../../app/utils/auth-errors'
import { parseCredentials } from '../../utils/auth-input'
import {
  authError,
  appOrigin,
  authLimiter,
  clientIp,
  guardAuthPost,
  readAuthBody,
  tooManyAttempts,
} from '../../utils/auth-route'
import { callbackUrl } from '../../utils/auth-callback'
import { useServerSupabase } from '../../utils/supabase'

// Creates an account. With email confirmation on, Supabase returns no session: nothing is set and
// the client is told to check its mailbox. Otherwise the visitor is signed in (HttpOnly cookies).
export default defineEventHandler(async (event) => {
  const refused = guardAuthPost(event, { json: true })
  if (refused) return refused

  const ip = authLimiter.hitIp('signup', clientIp(event))
  if (!ip.allowed) return tooManyAttempts(event, ip.retryAfterSeconds)

  const parsed = parseCredentials(await readAuthBody(event), 'register')
  if (!parsed.ok) return authError(event, 400, parsed.error)

  try {
    const { data, error } = await useServerSupabase(event).auth.signUp({
      email: parsed.email,
      password: parsed.password,
      options: { emailRedirectTo: callbackUrl(appOrigin(event)) },
    })
    if (error) throw error
    if (!data.session || !data.user) return { status: 'confirm_email' }
    return { user: { id: data.user.id, email: data.user.email ?? '' } }
  } catch (err) {
    const { status, body } = authErrorResponse(err, 'register')
    return authError(event, status, body.error, body.code ? { code: body.code } : undefined)
  }
})
