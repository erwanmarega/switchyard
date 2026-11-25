<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { CheckStatus, ProjectPath } from '@switchyard/plugin-sdk'
import LinePlan from '~/components/dashboard/LinePlan.vue'
import PathList from '~/components/dashboard/PathList.vue'
import type { NodeDiagnostic, ProjectIncident } from '~/utils/diagnostics'

defineProps<{
  path: ProjectPath
  statuses: Partial<Record<string, CheckStatus>>
  errors: string[]
  diagnostics?: Record<string, NodeDiagnostic>
  incident: ProjectIncident | null
  selectedId: string | null
}>()

const emit = defineEmits<{ select: [id: string] }>()

// Plan or plain list of the path; the preference is read on the client only (SSR-safe).
const VIEW_STORAGE_KEY = 'switchyard:path-view'
const view = ref<'graph' | 'list'>('graph')
// Set when the plan reports it cannot render (no WebGL): the list is shown instead.
const unsupported = ref(false)

function setView(next: 'graph' | 'list') {
  view.value = next
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, next)
  } catch {
    // Preference simply not persisted.
  }
}

onMounted(() => {
  try {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY)
    if (saved === 'graph' || saved === 'list') view.value = saved
  } catch {
    // Storage unavailable (privacy mode, blocked): keep the default view.
  }
})
</script>

<template>
  <section class="graph" aria-labelledby="graph-title">
    <header class="head">
      <div class="titles">
        <h2 id="graph-title">PLAN DE LIGNE</h2>
        <span class="sub">Parcours d'une requête, de gauche à droite</span>
      </div>
      <span class="toggle" role="group" aria-label="Affichage du chemin">
        <button type="button" :aria-pressed="view === 'graph'" @click="setView('graph')">
          Graphe
        </button>
        <button type="button" :aria-pressed="view === 'list'" @click="setView('list')">
          Liste
        </button>
      </span>
    </header>

    <p v-if="errors.length" class="error-box">Chemin invalide : {{ errors.join(' ; ') }}</p>
    <template v-else>
      <div class="box">
        <PathList
          v-if="view === 'list' || unsupported"
          :path="path"
          :statuses="statuses"
          :diagnostics="diagnostics"
          :selected-id="selectedId"
          @select="emit('select', $event)"
        />
        <LinePlan
          v-else
          :path="path"
          :statuses="statuses"
          :diagnostics="diagnostics"
          :incident="incident"
          :selected-id="selectedId"
          @select="emit('select', $event)"
          @unsupported="unsupported = true"
        />
      </div>

      <ul class="legend">
        <li><span class="ring ok" aria-hidden="true"></span>OK</li>
        <li><span class="ring warn" aria-hidden="true"></span>Attention</li>
        <li><span class="ring bad" aria-hidden="true"></span>Bloqué</li>
        <li><span class="cut" aria-hidden="true"></span>Voie coupée</li>
        <li v-if="incident"><span class="off" aria-hidden="true"></span>Hors chemin de la panne</li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.graph {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 14px;
}
.titles {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 14px;
}
h2 {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
  line-height: 1.4;
  color: var(--prussian);
}
.sub {
  font-size: 13px;
  color: var(--dash-muted);
}
.toggle {
  display: inline-flex;
  border: 1px solid var(--prussian);
}
.toggle button {
  min-height: 44px;
  padding: 0 16px;
  font-family: var(--font-mono);
  font-size: 13px;
  background: transparent;
  color: var(--prussian);
  border: 0;
  border-radius: 0;
  cursor: pointer;
}
.toggle button + button {
  border-left: 1px solid var(--prussian);
}
.toggle button[aria-pressed='true'] {
  background: var(--prussian);
  color: #fff;
}
.toggle button:focus-visible {
  outline: 2px solid var(--prussian);
  outline-offset: 2px;
}
.error-box {
  border: 1px solid var(--status-bad);
  background: #fdf1ef;
  color: var(--dash-ink);
  padding: 14px 16px;
}
.box {
  border: 1px solid var(--dash-line);
}
.legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 22px;
  margin: 0;
  padding: 12px 0 0;
  list-style: none;
  border-top: 1px solid var(--dash-line);
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--dash-muted);
}
.legend li {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.ring {
  width: 14px;
  height: 14px;
  border: 3px solid;
  border-radius: 50%;
}
.ring.ok {
  border-color: var(--status-ok);
}
.ring.warn {
  border-color: var(--status-warn);
}
.ring.bad {
  border-color: var(--status-bad);
}
.cut {
  width: 28px;
  height: 0;
  border-top: 3px dashed var(--status-bad);
}
.off {
  width: 28px;
  height: 4px;
  background: var(--prussian);
  opacity: 0.35;
}
</style>
