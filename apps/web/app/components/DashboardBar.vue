<script setup lang="ts">
import { navigateTo, ref } from '#imports'
import { useAuth } from '~/composables/useAuth'

defineProps<{ project?: string }>()

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
    <div class="trail">
      <NuxtLink to="/" class="brand" aria-label="Switchyard, accueil">
        <svg
          width="30"
          height="16"
          viewBox="0 0 30 16"
          aria-hidden="true"
          shape-rendering="crispEdges"
        >
          <rect x="0" y="4" width="30" height="2" fill="currentColor" />
          <rect x="0" y="10" width="30" height="2" fill="currentColor" />
          <rect x="4" y="1" width="2" height="14" fill="currentColor" />
          <rect x="12" y="1" width="2" height="14" fill="currentColor" />
          <rect x="20" y="1" width="2" height="14" fill="currentColor" />
          <rect x="25" y="5" width="5" height="6" fill="currentColor" />
        </svg>
        <span class="name">Switchyard</span>
      </NuxtLink>
      <template v-if="project">
        <span class="sep" aria-hidden="true">/</span>
        <span class="project">{{ project }}</span>
      </template>
    </div>
    <div class="account">
      <span v-if="user" class="email">{{ user.email }}</span>
      <button class="logout" type="button" :disabled="pending" @click="onLogout">
        {{ pending ? 'Déconnexion…' : 'Se déconnecter' }}
      </button>
    </div>
  </header>
</template>

<style scoped>
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 64px;
  padding: 0 32px;
  background: #fff;
  color: var(--dash-ink);
  border-bottom: 1px solid var(--dash-line);
}
.trail {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.brand {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 44px;
  text-decoration: none;
  color: var(--prussian);
}
.name {
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 600;
}
.sep {
  color: var(--dash-faint);
}
.project {
  font-family: var(--font-mono);
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  color: var(--dash-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.logout {
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid var(--prussian);
  border-radius: 0;
  background: transparent;
  color: var(--prussian);
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.logout:hover {
  background: var(--dash-panel);
}
.logout:focus-visible {
  outline-color: var(--prussian);
}
.logout:disabled {
  opacity: 0.6;
  cursor: progress;
}
@media (max-width: 820px) {
  .bar {
    padding: 8px 20px;
  }
}
</style>
