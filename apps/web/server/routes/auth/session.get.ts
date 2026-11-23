import { resolveSession } from '../../utils/supabase'

// The current user, verified on the server; null for anonymous visitors.
export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'private, no-store')
  const { user } = await resolveSession(event)
  return { user }
})
