<script setup lang="ts">
import { computed } from 'vue'
import type { CheckStatus, PathNode } from '@switchyard/plugin-sdk'
import { STATUS_LABELS, STATUS_TEXT_VARS, STATUS_VARS } from '~/utils/to-flow'
import { formatClock } from '~/utils/diagnostics'
import type { NodeDiagnostic, ProjectIncident } from '~/utils/diagnostics'

const props = defineProps<{
  node: Pick<PathNode, 'id' | 'label'>
  status: CheckStatus
  diagnostic?: NodeDiagnostic
  incident: ProjectIncident | null
}>()

const emit = defineEmits<{ close: [] }>()

// The action ("Voir le déploiement…") only makes sense on the stations of the incident.
const action = computed(() => {
  const incident = props.incident
  if (!incident?.action) return null
  const involved = [incident.causeNodeId, incident.symptomNodeId].includes(props.node.id)
  return involved ? incident.action : null
})
</script>

<template>
  <aside class="panel" :aria-label="`Gare sélectionnée : ${node.label}`">
    <div class="top">
      <span class="label">GARE SÉLECTIONNÉE</span>
      <button type="button" class="close" aria-label="Fermer le panneau" @click="emit('close')">
        <PixelIcon name="close" />
      </button>
    </div>

    <div class="identity">
      <div class="title">
        <span class="ring" :style="{ borderColor: STATUS_VARS[status] }" aria-hidden="true"></span>
        <h2>{{ node.label }}</h2>
      </div>
      <template v-if="diagnostic">
        <span v-if="diagnostic.description" class="description">{{ diagnostic.description }}</span>
        <span class="pill" :style="{ color: STATUS_TEXT_VARS[status] }" data-test="status-pill">
          <span class="dot" :style="{ background: STATUS_VARS[status] }" aria-hidden="true"></span>
          {{ STATUS_LABELS[status]
          }}<template v-if="diagnostic.since"> depuis {{ formatClock(diagnostic.since) }}</template>
        </span>
      </template>
    </div>

    <p v-if="!diagnostic" class="muted">Aucun diagnostic disponible.</p>
    <template v-else>
      <section class="block" aria-labelledby="checks-title">
        <h3 id="checks-title" class="label strong">VÉRIFICATIONS</h3>
        <ul class="checks">
          <li v-for="check in diagnostic.checks" :key="check.id">
            <span
              class="check-dot"
              :style="{ background: STATUS_VARS[check.status] }"
              role="img"
              :aria-label="STATUS_LABELS[check.status]"
            ></span>
            <div>
              <div class="check-label">{{ check.label }}</div>
              <div class="check-detail">{{ check.detail }}</div>
            </div>
          </li>
        </ul>
        <div class="foot">
          <a
            v-if="diagnostic.console"
            :href="diagnostic.console.url"
            target="_blank"
            rel="noopener noreferrer"
            class="console"
            >{{ diagnostic.console.label }}
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M4 2h6v6M10 2L3 9" stroke="currentColor" stroke-width="1.4" fill="none" />
            </svg>
          </a>
          <span class="checked">Vérifié à {{ formatClock(diagnostic.checkedAt) }}</span>
        </div>
      </section>

      <section
        v-if="diagnostic.trace?.length || action"
        class="block"
        aria-labelledby="trace-title"
      >
        <h3 id="trace-title" class="label strong">REMONTER VERS</h3>
        <ol v-if="diagnostic.trace?.length" class="trace">
          <li v-for="(step, i) in diagnostic.trace" :key="i">
            <span
              class="marker"
              :class="{ cause: step.cause }"
              :style="{ borderColor: STATUS_VARS[step.status] }"
              aria-hidden="true"
            ></span>
            <div class="step-label">
              {{ step.label }}
              <span v-if="step.role" class="role">· {{ step.role }}</span>
              <span v-if="step.cause" class="cause-chip">CAUSE PROBABLE</span>
            </div>
            <div class="check-detail">{{ step.detail }}</div>
          </li>
        </ol>
        <a
          v-if="action"
          :href="action.url"
          target="_blank"
          rel="noopener noreferrer"
          class="action"
          >{{ action.label }}</a
        >
      </section>
    </template>
  </aside>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
.close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin: -10px -10px -10px 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--dash-ink);
  cursor: pointer;
}
.close:focus-visible,
.console:focus-visible,
.action:focus-visible {
  outline-color: var(--prussian);
}
.identity {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.title {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ring {
  flex: none;
  width: 22px;
  height: 22px;
  border: 5px solid;
  border-radius: 50%;
  background: var(--paper);
}
h2 {
  font-family: var(--font-mono);
  font-size: 24px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--prussian);
  overflow-wrap: anywhere;
}
.description,
.muted {
  font-size: 14px;
  color: var(--dash-muted);
}
.pill {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 3px 10px;
  border: 1px solid currentColor;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.checks {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--dash-line);
}
.checks li {
  display: flex;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--dash-line);
}
.check-dot {
  flex: none;
  width: 10px;
  height: 10px;
  margin-top: 5px;
  border-radius: 50%;
}
.check-label {
  font-size: 14px;
  font-weight: 600;
}
.check-detail {
  font-size: 13px;
  color: var(--dash-muted);
  overflow-wrap: anywhere;
}
.foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 4px;
}
.console {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--prussian);
}
.checked {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--dash-muted);
}
.trace {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 0;
  padding: 0 0 0 30px;
  list-style: none;
}
.trace::before {
  content: '';
  position: absolute;
  left: 7px;
  top: 10px;
  bottom: 10px;
  width: 4px;
  background: var(--prussian);
}
.trace li {
  position: relative;
}
.marker {
  position: absolute;
  left: -30px;
  top: 2px;
  width: 18px;
  height: 18px;
  border: 4px solid;
  border-radius: 50%;
  background: var(--dash-panel);
}
.marker.cause {
  background: var(--dash-ink);
}
.step-label {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
}
.role {
  font-weight: 400;
  color: var(--dash-muted);
}
.cause-chip {
  margin-left: 4px;
  padding: 1px 6px;
  background: var(--dash-ink);
  color: #fff;
  font-size: 11px;
}
.action {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid var(--prussian);
  color: var(--prussian);
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
}
</style>
