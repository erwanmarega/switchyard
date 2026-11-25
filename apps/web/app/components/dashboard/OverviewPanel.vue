<script setup lang="ts">
import { computed } from 'vue'
import type { ProjectPath } from '@switchyard/plugin-sdk'
import { formatClock } from '~/utils/diagnostics'
import type { ProjectOverviewData } from '~/utils/diagnostics'

const props = defineProps<{ project: ProjectOverviewData; path: ProjectPath }>()

const incidents = computed(() => (props.project.incident ? 1 : 0))
</script>

<template>
  <aside class="panel" aria-label="Vue d'ensemble du projet">
    <span class="label">VUE D'ENSEMBLE</span>
    <div class="stats">
      <div class="cell">
        <div class="num">{{ path.nodes.length }}</div>
        <div class="unit">{{ path.nodes.length > 1 ? 'gares' : 'gare' }}</div>
      </div>
      <div class="cell">
        <div class="num">{{ path.edges.length }}</div>
        <div class="unit">{{ path.edges.length > 1 ? 'voies' : 'voie' }}</div>
      </div>
      <div class="cell">
        <div class="num">{{ incidents }}</div>
        <div class="unit">{{ incidents > 1 ? 'incidents' : 'incident' }}</div>
      </div>
    </div>

    <section v-if="project.deadlines.length" class="block" aria-labelledby="deadlines-title">
      <h3 id="deadlines-title" class="label strong">PROCHAINES ÉCHÉANCES</h3>
      <ul class="deadlines">
        <li v-for="d in project.deadlines" :key="d.label">
          <span class="d-label">{{ d.label }}</span>
          <span class="d-value">{{ d.value }}</span>
        </li>
      </ul>
    </section>

    <div class="hint">
      <span class="hint-title">Aucune gare sélectionnée</span>
      <span class="hint-text"
        >Sélectionne une gare sur le plan pour voir ses vérifications et ouvrir l'outil.</span
      >
    </div>
    <span class="next">Prochaine vérification à {{ formatClock(project.nextCheckAt) }}</span>
  </aside>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.label {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.12em;
  line-height: 1.4;
  color: var(--dash-muted);
}
.label.strong {
  font-weight: 600;
  color: var(--prussian);
}
.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  background: var(--dash-line);
  border: 1px solid var(--dash-line);
}
.cell {
  background: var(--dash-panel);
  padding: 14px 12px;
}
.num {
  font-family: var(--font-pixel);
  font-size: 32px;
  line-height: 1;
  color: var(--prussian);
}
.unit {
  margin-top: 6px;
  font-size: 12px;
  color: var(--dash-muted);
}
.block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.deadlines {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--dash-line);
}
.deadlines li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--dash-line);
}
.d-label {
  font-size: 14px;
}
.d-value {
  flex: none;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--dash-muted);
}
.hint {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  border: 1px dashed var(--prussian);
}
.hint-title {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--prussian);
}
.hint-text {
  font-size: 13px;
  color: var(--dash-muted);
}
.next {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--dash-muted);
}
</style>
