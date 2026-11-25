<script setup lang="ts">
import type { CheckStatus, ProjectPath } from '@switchyard/plugin-sdk'
import { STATUS_LABELS, STATUS_VARS } from '~/utils/to-flow'
import { neighbourNodes, type NodeDiagnostic } from '~/utils/diagnostics'

// Accessible list alternative to the plan: one row per node, in train order. A row selects the
// station; its details are shown in the side panel.
const props = defineProps<{
  path: ProjectPath
  statuses: Partial<Record<string, CheckStatus>>
  diagnostics?: Record<string, NodeDiagnostic>
  selectedId?: string | null
}>()

const emit = defineEmits<{ select: [id: string] }>()

function names(id: string, side: 'upstream' | 'downstream'): string {
  const list = neighbourNodes(props.path, id)[side]
  return list.length ? list.map((n) => n.label).join(', ') : '—'
}
</script>

<template>
  <ol class="list">
    <li
      v-for="node in path.nodes"
      :key="node.id"
      class="row"
      :class="{ error: statuses[node.id] === 'error' }"
      :data-status="statuses[node.id] ?? 'unknown'"
    >
      <button
        type="button"
        class="head"
        :data-row-button="node.id"
        :aria-pressed="selectedId === node.id"
        @click="emit('select', node.id)"
      >
        <span class="ring" :style="{ borderColor: STATUS_VARS[statuses[node.id] ?? 'unknown'] }">
          <span class="sr-only">{{ STATUS_LABELS[statuses[node.id] ?? 'unknown'] }}</span>
        </span>
        <span class="ident">
          <span class="label">{{ node.label }}</span>
          <span class="status-line">{{
            diagnostics?.[node.id]?.statusLine ?? STATUS_LABELS[statuses[node.id] ?? 'unknown']
          }}</span>
        </span>
        <span class="links">
          <span>Dépend de : {{ names(node.id, 'upstream') }}</span>
          <span>Alimente : {{ names(node.id, 'downstream') }}</span>
        </span>
      </button>
    </li>
  </ol>
</template>

<style scoped>
.list {
  margin: 0;
  padding: 0;
  list-style: none;
  background: var(--paper);
}
.row {
  border-bottom: 1px solid var(--dash-line);
}
.row:last-child {
  border-bottom: 0;
}
.head {
  display: grid;
  grid-template-columns: 22px minmax(140px, 1fr) minmax(0, 2fr);
  gap: 16px;
  align-items: center;
  width: 100%;
  min-height: 44px;
  padding: 12px 16px;
  background: transparent;
  border: 0;
  border-radius: 0;
  color: var(--dash-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.head:hover {
  background: var(--dash-panel);
}
.head[aria-pressed='true'] {
  background: var(--dash-panel);
  box-shadow: inset 3px 0 0 var(--prussian);
}
.head:focus-visible {
  outline: 2px solid var(--prussian);
  outline-offset: -2px;
}
.ring {
  width: 22px;
  height: 22px;
  border: 5px solid;
  border-radius: 50%;
  background: var(--paper);
}
.ident {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.label {
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 600;
  color: var(--prussian);
  overflow-wrap: anywhere;
}
.status-line {
  font-size: 13px;
  color: var(--dash-muted);
}
.links {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 20px;
  font-size: 13px;
  color: var(--dash-muted);
}
@media (max-width: 820px) {
  .head {
    grid-template-columns: 22px 1fr;
    gap: 8px 12px;
  }
  .links {
    grid-column: 2;
  }
}
</style>
