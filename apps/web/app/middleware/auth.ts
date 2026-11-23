import { guardRedirect } from '~/utils/auth-guard'

// Protects pages that need a session: unauthenticated users go to /connexion.
export default defineNuxtRouteMiddleware((to) => {
  const { user } = useAuth()
  const target = guardRedirect('auth', user.value !== null, to.fullPath)
  if (target) return navigateTo(target)
})
