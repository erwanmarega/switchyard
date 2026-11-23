<script setup>
import SectionHeader from './SectionHeader.vue'

const steps = [
  "Cœur de l'application : système de plugins, stockage chiffré des tokens",
  'Affichage du graphe du projet',
  'Intégration Vercel',
  'Intégration Stripe',
  'Intégration Cloudflare',
  'Alertes (webhook Discord/Slack, email)',
  'Historique des vérifications',
  "Image Docker et documentation d'installation",
  'Guide pour écrire une nouvelle intégration',
]
</script>

<template>
  <section id="feuille-de-route" class="pad" aria-labelledby="roadmap-title">
    <SectionHeader id="roadmap-title" title="Les prochaines gares.">
      Neuf étapes jusqu'à une première version utilisable. Aucune n'est encore commencée.
    </SectionHeader>
    <ol class="line">
      <li v-for="(s, i) in steps" :key="s">
        <span class="station" aria-hidden="true"></span>
        <span class="idx mono-label">Gare {{ String(i + 1).padStart(2, '0') }}</span>
        <p>{{ s }}</p>
        <span class="todo mono-label">à venir<span class="sr-only"> (non commencé)</span></span>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.line {
  list-style: none;
  margin: 0;
  padding: 0 0 0 28px;
  position: relative;
}
.line::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 12px;
  bottom: 12px;
  width: 1px;
  background: var(--prussian);
}
li {
  position: relative;
  display: grid;
  grid-template-columns: 110px 1fr auto;
  gap: 20px;
  align-items: baseline;
  padding: 16px 0;
  border-bottom: 1px solid var(--line);
}
li:first-child {
  border-top: 1px solid var(--line);
}
.station {
  position: absolute;
  left: -28px;
  top: 24px;
  width: 11px;
  height: 11px;
  background: var(--paper);
  border: 1px solid var(--prussian);
}
.idx {
  color: var(--prussian);
}
p {
  font-size: 16px;
  font-weight: 500;
}
.todo {
  font-size: 11px;
  border: 1px solid var(--line);
  padding: 2px 8px;
  opacity: 0.8;
}
@media (max-width: 640px) {
  li {
    grid-template-columns: 1fr auto;
    gap: 4px 12px;
  }
  .idx {
    grid-column: 1 / -1;
  }
}
</style>
