import { authErrorResponse } from '../../../app/utils/auth-errors'
import { parseCredentials } from '../../utils/auth-input'
import {
  authError,
  authLimiter,
  clientIp,
  guardAuthPost,
  readAuthBody,
  tooManyAttempts,
} from '../../utils/auth-route'
import { useServerSupabase } from '../../utils/supabase'

// Signs in with email + password and sets the HttpOnly session cookies. The browser never sees
// the tokens: the response only carries the user.
export default defineEventHandler(async (event) => {
  const refused = guardAuthPost(event, { json: true })
  if (refused) return refused

  const ip = authLimiter.hitIp('login', clientIp(event))
  if (!ip.allowed) return tooManyAttempts(event, ip.retryAfterSeconds)

  const parsed = parseCredentials(await readAuthBody(event), 'login')
  if (!parsed.ok) return authError(event, 400, parsed.error)
  const { email, password } = parsed

  const ipAddress = clientIp(event)
  const locked = authLimiter.checkLogin(email, ipAddress)
  if (!locked.allowed) return tooManyAttempts(event, locked.retryAfterSeconds)

  try {
    const { data, error } = await useServerSupabase(event).auth.signInWithPassword({
      email,
      password,
    })
    if (error || !data.user) throw error ?? new Error('no user')
    authLimiter.clearLogin(email, ipAddress)
    return { user: { id: data.user.id, email: data.user.email ?? '' } }
  } catch (err) {
    const { status, body } = authErrorResponse(err, 'login')
    // Only wrong credentials count (401): not outages, Supabase rate limits, or an unconfirmed
    // email (403), which Supabase only reports once the password matched.
    if (status === 401) authLimiter.recordLoginFailure(email, ipAddress)
    return authError(event, status, body.error)
  }
})
