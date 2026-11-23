<script setup>
import { ref } from 'vue'
import { useAuth } from '~/composables/useAuth'

const { user } = useAuth()
const open = ref(false)
const links = [
  { href: '/#probleme', label: 'Problème' },
  { href: '/#solution', label: 'Solution' },
  { href: '/#integrations', label: 'Intégrations' },
  { href: '/#principes', label: 'Principes' },
  { href: '/#feuille-de-route', label: 'Feuille de route' },
]
</script>

<template>
  <header class="nav">
    <NuxtLink to="/#top" class="brand" aria-label="Switchyard, accueil">
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
    <button
      class="toggle"
      type="button"
      :aria-expanded="open"
      aria-controls="nav-menu"
      @click="open = !open"
    >
      {{ open ? 'Fermer' : 'Menu' }}
    </button>
    <nav id="nav-menu" :class="{ open }" aria-label="Navigation principale">
      <ul>
        <li v-for="l in links" :key="l.href">
          <NuxtLink :to="l.href" @click="open = false">{{ l.label }}</NuxtLink>
        </li>
      </ul>
      <div class="actions">
        <a class="btn btn-light" href="#">GitHub</a>
        <NuxtLink
          v-if="user"
          class="btn btn-light"
          to="/dashboard"
          data-testid="nav-account"
          @click="open = false"
          >Tableau de bord</NuxtLink
        >
        <NuxtLink
          v-else
          class="btn btn-light"
          to="/connexion"
          data-testid="nav-account"
          @click="open = false"
          >Se connecter</NuxtLink
        >
        <NuxtLink class="btn btn-dark" to="/#solution" @click="open = false">Démo</NuxtLink>
      </div>
    </nav>
  </header>
</template>

<style scoped>
.nav {
  position: relative;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 32px;
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
nav {
  display: flex;
  align-items: center;
  gap: 32px;
}
ul {
  display: flex;
  gap: 24px;
  list-style: none;
  margin: 0;
  padding: 0;
}
nav ul a {
  font-size: 14px;
  text-decoration: none;
  color: var(--paper);
  opacity: 0.9;
}
nav ul a:hover {
  opacity: 1;
  text-decoration: underline;
  text-underline-offset: 4px;
}
.actions {
  display: flex;
  gap: 8px;
}
.toggle {
  display: none;
  font-family: var(--font-mono);
  font-size: 13px;
  background: var(--paper);
  color: var(--navy-ink);
  border: 0;
  border-radius: 0;
  padding: 9px 12px;
  cursor: pointer;
}
@media (max-width: 820px) {
  .nav {
    padding: 14px 20px;
  }
  .toggle {
    display: block;
  }
  nav {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
    background: var(--navy-ink);
    padding: 8px 20px 20px;
  }
  nav.open {
    display: flex;
  }
  ul {
    flex-direction: column;
    gap: 0;
  }
  nav ul a {
    display: block;
    padding: 12px 0;
    border-bottom: 1px solid var(--line-light);
  }
}
</style>
