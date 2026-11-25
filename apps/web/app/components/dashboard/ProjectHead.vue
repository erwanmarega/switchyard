<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { CheckStatus, ProjectPath } from '@switchyard/plugin-sdk'
import { formatClock, lastCheckedAt } from '~/utils/diagnostics'
import type { NodeDiagnostic, ProjectOverviewData } from '~/utils/diagnostics'

const props = defineProps<{
  project: ProjectOverviewData
  statuses: Partial<Record<string, CheckStatus>>
  diagnostics?: Record<string, NodeDiagnostic>
  path: ProjectPath
}>()

const incidentCount = computed(() => (props.project.incident ? 1 : 0))
const isEmpty = computed(() => props.path.nodes.length === 0)
const incidentLabel = computed(
  () => `${incidentCount.value} ${incidentCount.value > 1 ? 'incidents' : 'incident'} en cours`,
)

const checkedAt = computed(() => lastCheckedAt(props.diagnostics ?? {}))

// "il y a N min" depends on the current time: computed on the client after mount only, so the
// server-rendered HTML and the hydration pass agree (the relative part is simply omitted there).
const now = ref<number | null>(null)
onMounted(() => {
  now.value = Date.now()
})
const relative = computed(() => {
  if (now.value === null || !checkedAt.value) return null
  const minutes = Math.max(0, Math.floor((now.value - Date.parse(checkedAt.value)) / 60_000))
  if (Number.isNaN(minutes)) return null
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  return `il y a ${Math.floor(hours / 24)} j`
})
</script>

<template>
  <section class="head" aria-labelledby="project-title">
    <img
      class="bg"
      src="/img/dash-band.webp"
      alt=""
      aria-hidden="true"
      width="2400"
      height="520"
      decoding="async"
    />
    <div class="shade" aria-hidden="true"></div>
    <div class="info">
      <span class="label">PROJET</span>
      <h1 id="project-title">{{ project.name }}</h1>
      <div class="meta">
        <span v-if="isEmpty" class="pill empty">Aucun outil connecté</span>
        <span v-else-if="project.incident" class="pill bad">
          <span class="dot" aria-hidden="true"></span>{{ incidentLabel }}
        </span>
        <span v-else class="pill ok">
          <span class="dot" aria-hidden="true"></span>Tout circule · aucun incident
        </span>
        <span v-if="isEmpty" class="when">Projet créé aujourd'hui</span>
        <span v-else-if="checkedAt" class="when">
          Dernière vérification à {{ formatClock(checkedAt)
          }}<template v-if="relative"> · {{ relative }}</template>
        </span>
      </div>
    </div>
    <div v-if="!isEmpty" class="actions">
      <button
        type="button"
        class="btn outline"
        disabled
        aria-disabled="true"
        aria-describedby="recheck-note"
        title="Bientôt : vérifications réelles"
      >
        <PixelIcon name="refresh" />Revérifier
      </button>
      <span id="recheck-note" class="sr-only">Bientôt : vérifications réelles</span>
      <a href="#integrations" class="btn signal"><PixelIcon name="plus" />Ajouter un outil</a>
    </div>
  </section>
</template>

<style scoped>
.head {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding: 48px 32px 28px;
  overflow: hidden;
  background-color: var(--prussian);
  color: var(--paper);
}
.bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: right center;
}
.shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    rgba(27, 58, 140, 0.78) 0%,
    rgba(27, 58, 140, 0.35) 45%,
    rgba(27, 58, 140, 0) 70%
  );
}
.info,
.actions {
  position: relative;
}
.info {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.label {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.12em;
  color: var(--paper);
  opacity: 0.8;
}
h1 {
  font-size: 48px;
  line-height: 1;
  color: var(--paper);
  overflow-wrap: anywhere;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  font-size: 14px;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  background: var(--paper);
  color: var(--navy-ink);
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}
.pill.bad {
  color: var(--status-bad-text);
}
.pill.bad .dot {
  background: var(--status-bad);
}
.pill.ok {
  color: var(--status-ok-text);
}
.pill.ok .dot {
  background: var(--status-ok);
}
.pill.empty {
  color: var(--prussian);
}
.when {
  color: var(--paper);
  opacity: 0.8;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 18px;
  border: 1px solid var(--paper);
  border-radius: 0;
  background: transparent;
  color: var(--paper);
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
}
.btn.outline:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.btn.signal {
  border-color: var(--signal);
  background: var(--signal);
  color: #fff;
  font-weight: 600;
}
.btn.signal:hover {
  border-color: #c0481a;
  background: #c0481a;
}
.btn:focus-visible {
  outline-color: var(--paper);
}
@media (max-width: 820px) {
  .head {
    padding: 40px 20px 20px;
  }
  .shade {
    background: linear-gradient(0deg, rgba(27, 58, 140, 0.85) 0%, rgba(27, 58, 140, 0.3) 70%);
  }
  h1 {
    font-size: 36px;
  }
}
</style>
