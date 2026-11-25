<script setup lang="ts">
import { navigateTo, ref } from '#imports'
import { useAuth } from '~/composables/useAuth'

const { user, logout } = useAuth()
const pending = ref(false)

async function onLogout() {
  pending.value = true
  try {
    await logout()
  } finally {
    pending.value = false
    await navigateTo('/')
  }
}
</script>

<template>
  <header class="bar">
    <NuxtLink to="/" class="brand" aria-label="Switchyard, accueil">
      <svg
        width="28"
        height="16"
        viewBox="0 0 28 16"
        aria-hidden="true"
        shape-rendering="crispEdges"
      >
        <rect x="0" y="4" width="28" height="2" fill="currentColor" />
        <rect x="0" y="10" width="28" height="2" fill="currentColor" />
        <rect x="4" y="2" width="2" height="12" fill="currentColor" />
        <rect x="12" y="2" width="2" height="12" fill="currentColor" />
        <rect x="20" y="2" width="2" height="12" fill="currentColor" />
        <rect x="22" y="5" width="6" height="6" fill="var(--signal)" />
      </svg>
      <span>Switchyard</span>
    </NuxtLink>
    <div class="account">
      <span v-if="user" class="email">{{ user.email }}</span>
      <button class="btn btn-light" type="button" :disabled="pending" @click="onLogout">
        <PixelIcon name="logout" />{{ pending ? 'Déconnexion…' : 'Se déconnecter' }}
      </button>
    </div>
  </header>
</template>

<style scoped>
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 14px 32px;
  background: var(--prussian);
  color: var(--paper);
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  font-family: var(--font-pixel);
  font-size: 22px;
  color: var(--paper);
}
.account {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}
.email {
  font-family: var(--font-mono);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.btn:disabled {
  opacity: 0.6;
  cursor: progress;
}
@media (max-width: 820px) {
  .bar {
    padding: 12px 20px;
  }
}
</style>
