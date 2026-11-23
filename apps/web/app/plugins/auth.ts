// Hydrates the session user on the server (verified by the server middleware, which also refreshed
// an expired token); the state is then transferred to the client with the SSR payload.
export default defineNuxtPlugin(async () => {
  if (import.meta.server) {
    await useAuth().fetchUser()
  }
})
