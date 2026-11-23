// Resolves the session once per request on the server; the state is then hydrated on the client.
export default defineNuxtPlugin(async () => {
  if (import.meta.server) {
    await useAuth().fetchUser()
  }
})
