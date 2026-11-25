<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { CheckStatus, ProjectPath } from '@switchyard/plugin-sdk'
import type { NodeDiagnostic, ProjectIncident } from '~/utils/diagnostics'
import { computeLinePlan } from '~/three/line-plan-layout'
import { STATUS_LABELS } from '~/utils/to-flow'
import { isWebGLAvailable } from '~/utils/webgl'
// Type-only import: three.js itself is loaded lazily, see start().
import type { LinePlanController, LinePlanView } from '~/three/line-plan'

const props = defineProps<{
  path: ProjectPath
  statuses: Partial<Record<string, CheckStatus>>
  diagnostics?: Record<string, NodeDiagnostic>
  incident: ProjectIncident | null
  selectedId: string | null
}>()
const emit = defineEmits<{ select: [id: string]; unsupported: [] }>()

interface Spot {
  x: number
  y: number
}
interface Tag {
  key: string
  text: string
  x: number
  y: number
  transform: string
  kind: 'symptom' | 'cause' | 'cut'
}

/** Station status line colours: the design shows the healthy line in ink. */
const LINE_COLORS: Record<CheckStatus, string> = {
  ok: 'var(--dash-ink)',
  warning: 'var(--status-warn-text)',
  error: 'var(--status-bad-text)',
  unknown: 'var(--dash-muted)',
}

const wrap = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const canvasKey = ref(0)
const phase = ref<'loading' | 'ready'>('loading')
const view = ref<LinePlanView>('persp')
const spots = ref<Record<string, Spot>>({})
const tags = ref<Tag[]>([])

const controller = shallowRef<LinePlanController | null>(null)
let stopChange: (() => void) | null = null
let resizeObserver: ResizeObserver | null = null
let generation = 0

const layout = computed(() => computeLinePlan(props.path, props.statuses, props.incident))

const statusOf = (id: string): CheckStatus => props.statuses[id] ?? 'unknown'
const lineOf = (id: string) => props.diagnostics?.[id]?.statusLine ?? STATUS_LABELS[statusOf(id)]

const ariaLabel = computed(() => {
  const stations = layout.value.stations
  const main = stations.filter((s) => s.onMain).map((s) => s.label)
  const branches = stations.filter((s) => !s.onMain).map((s) => s.label)
  const parts = [`Plan de ligne : ${main.join(', ')} sur la ligne principale`]
  if (branches.length) parts[0] += ` ; ${branches.join(' et ')} en embranchement`
  parts[0] += '.'
  const incident = props.incident
  if (incident) {
    const labelOf = (id: string) => props.path.nodes.find((n) => n.id === id)?.label ?? id
    const broken = props.path.edges.filter((e) => incident.brokenEdgeIds.includes(e.id))
    for (const e of broken) parts.push(`Voie ${labelOf(e.from)} vers ${labelOf(e.to)} coupée.`)
    parts.push(
      `Cause probable : ${labelOf(incident.causeNodeId)}, ${incident.causeTag.toLowerCase()}.`,
    )
  } else if (stations.every((s) => s.status === 'ok')) {
    parts.push('Toutes les gares sont opérationnelles.')
  }
  parts.push(`États : ${stations.map((s) => `${s.label} ${STATUS_LABELS[s.status]}`).join(', ')}.`)
  return parts.join(' ')
})

/** Re-projects every label and tag from the current camera. */
function refresh() {
  const ctrl = controller.value
  if (!ctrl) return
  const next: Record<string, Spot> = {}
  for (const s of layout.value.stations) next[s.id] = ctrl.project(s.x, s.z)
  spots.value = next

  const incident = props.incident
  const out: Tag[] = []
  const symptom = incident && layout.value.stations.find((s) => s.id === incident.symptomNodeId)
  const cause = incident && layout.value.stations.find((s) => s.id === incident.causeNodeId)
  if (incident && symptom) {
    const p = next[symptom.id]!
    // A station on the upper row carries its label above it: the tag then goes to its left.
    out.push(
      symptom.z < 0
        ? {
            key: 'symptom',
            kind: 'symptom',
            text: 'SYMPTÔME',
            x: p.x - 30,
            y: p.y,
            transform: 'translate(-100%, -50%)',
          }
        : {
            key: 'symptom',
            kind: 'symptom',
            text: 'SYMPTÔME',
            x: p.x,
            y: p.y - 30,
            transform: 'translate(-50%, -100%)',
          },
    )
  }
  if (incident && cause) {
    const p = next[cause.id]!
    out.push({
      key: 'cause',
      kind: 'cause',
      text: `CAUSE PROBABLE · ${incident.causeTag}`,
      // Centred above the cause: beside it, the tag covered the next station on the line.
      x: p.x,
      y: p.y - 34,
      transform: 'translate(-50%, -100%)',
    })
  }
  const cut = incident && layout.value.tracks.find((t) => t.broken)
  if (cut && cut.points.length >= 2) {
    const a = cut.points[cut.points.length - 2]!
    const b = cut.points[cut.points.length - 1]!
    const p = ctrl.project((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    out.push({
      key: 'cut',
      kind: 'cut',
      text: 'VOIE COUPÉE',
      x: p.x - 16,
      y: p.y,
      transform: 'translate(-100%, -50%)',
    })
  }
  tags.value = out
}

function teardown() {
  stopChange?.()
  stopChange = null
  controller.value?.dispose()
  controller.value = null
}

async function start() {
  const current = ++generation
  if (!isWebGLAvailable()) {
    emit('unsupported')
    return
  }
  try {
    // three.js stays out of the main bundle: this import is its own lazy chunk.
    const { createLinePlan } = await import('~/three/line-plan')
    if (current !== generation || !canvas.value) return
    const created = createLinePlan(canvas.value, {
      layout: layout.value,
      selectedId: props.selectedId,
      reducedMotion:
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      view: view.value,
      onPick: (id) => emit('select', id),
    })
    controller.value = created
    stopChange = created.onChange(refresh)
    const box = wrap.value
    if (box?.clientWidth && box.clientHeight) created.resize(box.clientWidth, box.clientHeight)
    refresh()
    phase.value = 'ready'
  } catch {
    // No WebGL, a failed chunk or a failed context: the page falls back to the 2D graph.
    if (current === generation) emit('unsupported')
  }
}

/** A fresh canvas per scene: a WebGL canvas cannot cleanly get a second renderer. */
async function rebuild() {
  generation++
  teardown()
  canvasKey.value++
  await nextTick()
  await start()
}

function setView(next: LinePlanView) {
  view.value = next
  controller.value?.setView(next)
}

onMounted(() => {
  if (wrap.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      const box = wrap.value
      if (box?.clientWidth && box.clientHeight) {
        controller.value?.resize(box.clientWidth, box.clientHeight)
      }
    })
    resizeObserver.observe(wrap.value)
  }
  void start()
})

onBeforeUnmount(() => {
  generation++
  resizeObserver?.disconnect()
  teardown()
})

watch(
  () => [props.path, props.statuses, props.incident],
  () => void rebuild(),
  { deep: true },
)
watch(
  () => props.selectedId,
  (id) => controller.value?.setSelected(id),
)
</script>

<template>
  <div ref="wrap" class="plan">
    <canvas
      :key="canvasKey"
      ref="canvas"
      class="canvas"
      role="img"
      :aria-label="ariaLabel"
    ></canvas>

    <template v-if="phase === 'ready'">
      <button
        v-for="s in layout.stations"
        v-show="spots[s.id]"
        :key="s.id"
        type="button"
        class="station"
        :class="{ selected: selectedId === s.id, above: s.z < 0 }"
        :style="{
          left: `${spots[s.id]?.x ?? 0}px`,
          top: `${(spots[s.id]?.y ?? 0) + (s.z < 0 ? -26 : 26)}px`,
        }"
        :aria-pressed="selectedId === s.id ? 'true' : 'false'"
        :aria-label="`${s.label} — ${STATUS_LABELS[s.status]}, afficher le détail`"
        @click="emit('select', s.id)"
      >
        <span class="name">{{ s.label }}</span>
        <span class="line" :style="{ color: LINE_COLORS[s.status] }">{{ lineOf(s.id) }}</span>
      </button>

      <div
        v-for="t in tags"
        :key="t.key"
        class="tag"
        :class="`tag-${t.kind}`"
        :style="{ left: `${t.x}px`, top: `${t.y}px`, transform: t.transform }"
        aria-hidden="true"
      >
        {{ t.text }}
      </div>
    </template>

    <div v-if="phase === 'loading'" class="loading" role="status">
      <span class="loading-text">Chargement du plan…</span>
    </div>

    <div class="toggle" role="group" aria-label="Vue du plan">
      <button
        type="button"
        class="toggle-btn"
        :class="{ active: view === 'persp' }"
        :aria-pressed="view === 'persp' ? 'true' : 'false'"
        @click="setView('persp')"
      >
        Perspective
      </button>
      <button
        type="button"
        class="toggle-btn"
        :class="{ active: view === 'plan' }"
        :aria-pressed="view === 'plan' ? 'true' : 'false'"
        @click="setView('plan')"
      >
        Plan
      </button>
    </div>
    <span class="hint">Glisser pour faire pivoter</span>
  </div>
</template>

<style scoped>
.plan {
  position: relative;
  height: 460px;
  overflow: hidden;
  background: #fff;
  color: var(--dash-ink);
}
.canvas {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
  touch-action: pan-y;
}
.station {
  position: absolute;
  transform: translateX(-50%);
}
.station.above {
  transform: translate(-50%, -100%);
}
.station {
  margin: 0;
  padding: 3px 7px;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
  font: inherit;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid transparent;
  border-radius: 0;
}
.station.selected {
  border-color: var(--prussian);
}
.station:focus-visible {
  outline: 2px solid var(--prussian);
  outline-offset: 2px;
}
.name {
  display: block;
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 600;
  color: var(--prussian);
}
.line {
  display: block;
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 500;
}
.tag {
  position: absolute;
  padding: 3px 8px;
  border: 1px solid var(--dash-ink);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  white-space: nowrap;
  pointer-events: none;
  background: #fff;
  color: var(--dash-ink);
}
.tag-cause {
  background: var(--dash-ink);
  color: #fff;
}
.tag-cut {
  color: var(--status-bad-text);
}
.loading {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
}
.loading-text {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--dash-muted);
}
.toggle {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 3;
  display: flex;
  border: 1px solid var(--prussian);
  background: #fff;
}
.toggle-btn {
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: 0;
  background: #fff;
  color: var(--prussian);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.toggle-btn.active {
  background: var(--prussian);
  color: #fff;
}
.toggle-btn:focus-visible {
  outline: 2px solid var(--prussian);
  outline-offset: 2px;
}
.hint {
  position: absolute;
  left: 12px;
  bottom: 10px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--dash-muted);
  pointer-events: none;
}
@media (max-width: 820px) {
  .plan {
    height: 360px;
  }
}
</style>
