<script setup>
import SectionHeader from './SectionHeader.vue'

// Tiny 8x8 pixel icons drawn as rects on a grid.
const features = [
  {
    label: '01 / Graphe',
    title: 'Graphe visuel',
    text: "Votre stack en un coup d'œil, avec l'état de chaque outil et de chaque lien.",
    px: [
      '11000011',
      '11000011',
      '00100100',
      '00011000',
      '00011000',
      '00100100',
      '11000011',
      '11000011',
    ],
  },
  {
    label: '02 / Vérifications',
    title: 'Vérifications concrètes',
    text: 'Des contrôles sur votre propre configuration, pas seulement sur le statut des fournisseurs.',
    px: [
      '00000011',
      '00000110',
      '00001100',
      '10011000',
      '11110000',
      '01100000',
      '00100000',
      '00000000',
    ],
  },
  {
    label: '03 / Corrélation',
    title: 'Corrélation',
    text: "Les erreurs sont reliées le long du chemin pour remonter jusqu'à la cause.",
    px: [
      '11000000',
      '11100000',
      '00110000',
      '00011000',
      '00001100',
      '00000111',
      '00000011',
      '00000000',
    ],
  },
  {
    label: '04 / Alertes',
    title: 'Alertes',
    text: "Par webhook (Discord, Slack) et par email, dès qu'un maillon casse.",
    px: [
      '00011000',
      '00111100',
      '01111110',
      '01111110',
      '01111110',
      '11111111',
      '00000000',
      '00011000',
    ],
  },
  {
    label: '05 / Historique',
    title: 'Historique',
    text: 'Toutes les vérifications et tous les incidents, pour comprendre ce qui a changé.',
    px: [
      '00111100',
      '01000010',
      '10010001',
      '10010001',
      '10011101',
      '10000001',
      '01000010',
      '00111100',
    ],
  },
  {
    label: '06 / Projets',
    title: 'Plusieurs projets',
    text: 'Plusieurs projets dans une même instance.',
    px: [
      '11110000',
      '10010000',
      '10011110',
      '11110010',
      '00010010',
      '00011110',
      '00000000',
      '00000000',
    ],
  },
]
</script>

<template>
  <section id="fonctionnalites" class="pad" aria-labelledby="features-title">
    <SectionHeader id="features-title" title="Ce que Switchyard surveillera pour vous.">
      Fonctionnalités prévues : le projet est en phase de conception, rien n'est encore disponible.
    </SectionHeader>
    <ul class="grid">
      <li v-for="f in features" :key="f.title" class="cell">
        <span class="mono-label">{{ f.label }}</span>
        <svg
          viewBox="0 0 8 8"
          width="40"
          height="40"
          shape-rendering="crispEdges"
          aria-hidden="true"
        >
          <template v-for="(row, y) in f.px" :key="y">
            <rect
              v-for="(c, x) in row.split('')"
              v-show="c === '1'"
              :key="x"
              :x="x"
              :y="y"
              width="1"
              height="1"
              fill="currentColor"
            />
          </template>
        </svg>
        <h3>{{ f.title }}</h3>
        <p>{{ f.text }}</p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-top: 1px solid var(--line);
  border-left: 1px solid var(--line);
}
.cell {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 24px;
  color: var(--prussian);
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.cell h3 {
  font-size: 26px;
}
.cell p {
  color: var(--navy-ink);
  font-size: 15px;
}
@media (max-width: 900px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 600px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
