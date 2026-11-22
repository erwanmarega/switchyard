<script setup>
import SectionHeader from './SectionHeader.vue'

const rows = [
  ['Gare', 'Un outil (Vercel, Stripe, Cloudflare...)'],
  ['Voie', 'Le lien entre deux outils'],
  ['Aiguillage', 'Une intégration'],
  ['Signal / sémaphore', 'Le statut d\'une vérification'],
  ['Gare de triage', 'Le graphe complet du projet'],
]
</script>

<template>
  <section id="vocabulaire" class="pad" aria-labelledby="lexicon-title">
    <SectionHeader id="lexicon-title" title="Le vocabulaire du rail.">
      Un switchyard, c'est une gare de triage : l'endroit où toutes les voies se croisent et où l'on organise
      le trafic. C'est exactement le rôle du graphe de Switchyard pour votre projet.
    </SectionHeader>
    <table>
      <caption class="sr-only">Correspondance entre le vocabulaire ferroviaire et Switchyard</caption>
      <thead>
        <tr><th scope="col">Ferroviaire</th><th scope="col">Switchyard</th></tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r[0]">
          <th scope="row">{{ r[0] }}</th>
          <td>{{ r[1] }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
table { width: 100%; border-collapse: collapse; border-top: 1px solid var(--line); }
th, td { text-align: left; padding: 16px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
thead th { font-family: var(--font-mono); font-size: 12px; font-weight: 400; text-transform: uppercase; opacity: 0.7; }
tbody th { font-family: var(--font-pixel); font-weight: 400; font-size: 24px; color: var(--prussian); width: 40%; line-height: 1.1; }
@media (max-width: 600px) { tbody th { font-size: 20px; } }
</style>
