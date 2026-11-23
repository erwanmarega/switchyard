import { guardRedirect } from '~/utils/auth-guard'

// Pages for visitors only (login/register): authenticated users go to the dashboard.
export default defineNuxtRouteMiddleware(() => {
  const { user } = useAuth()
  const target = guardRedirect('guest', user.value !== null, '')
  if (target) return navigateTo(target)
})
