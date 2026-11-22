<script setup>
import { ref, computed } from 'vue'

// Product mockup: status colors are allowed here.
const broken = ref(false)

const nodes = [
  { id: 'domain', label: 'Domaine', sub: 'registrar', x: 90, y: 90 },
  { id: 'cloudflare', label: 'Cloudflare', sub: 'DNS', x: 290, y: 90 },
  { id: 'vercel', label: 'Vercel', sub: 'front + API', x: 500, y: 90 },
  { id: 'db', label: 'Données', sub: 'base de données', x: 710, y: 90 },
  { id: 'stripe', label: 'Stripe', sub: 'webhooks', x: 500, y: 270 },
]
const HW = 62 // node half width
const HH = 30 // node half height

// Edges run between node borders. "horizontal" decides the rail offset axis.
const edges = [
  { id: 'e1', x1: 90 + HW, y1: 90, x2: 290 - HW, y2: 90, h: true },
  { id: 'e2', x1: 290 + HW, y1: 90, x2: 500 - HW, y2: 90, h: true },
  { id: 'e3', x1: 500 + HW, y1: 90, x2: 710 - HW, y2: 90, h: true },
  { id: 'stripe', x1: 500, y1: 270 - HH, x2: 500, y2: 90 + HH, h: false, label: '/api/stripe' },
]

const isBadNode = (id) => broken.value && id === 'stripe'
const isBadEdge = (id) => broken.value && id === 'stripe'
const nodeStatus = (id) => (isBadNode(id) ? 'bad' : 'ok')
const edgeStatus = (id) => (isBadEdge(id) ? 'bad' : 'ok')

const message = computed(() =>
  broken.value
    ? 'Le paiement est cassé : Stripe envoie ses webhooks vers /api/stripe, qui renvoie une erreur 500 depuis le déploiement de 14h02 sur Vercel.'
    : 'Tout le chemin est opérationnel.',
)
</script>

<template>
  <div class="mock">
    <div class="chrome">
      <span class="lights" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="title">switchyard / projet-demo / chemin</span>
      <button
        type="button"
        class="sim"
        :class="{ on: broken }"
        :aria-pressed="broken"
        @click="broken = !broken"
      >
        {{ broken ? 'Rétablir' : 'Simuler une panne' }}
      </button>
    </div>

    <svg viewBox="0 0 800 340" role="img" aria-label="Graphe du chemin : Domaine, Cloudflare, Vercel, Base de données, et Stripe relié à Vercel">
      <g v-for="e in edges" :key="e.id" :class="['edge', edgeStatus(e.id)]">
        <line
          class="ties"
          :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2"
        />
        <line
          class="rail"
          :x1="e.x1 + (e.h ? 0 : -4)" :y1="e.y1 + (e.h ? -4 : 0)"
          :x2="e.x2 + (e.h ? 0 : -4)" :y2="e.y2 + (e.h ? -4 : 0)"
        />
        <line
          class="rail"
          :x1="e.x1 + (e.h ? 0 : 4)" :y1="e.y1 + (e.h ? 4 : 0)"
          :x2="e.x2 + (e.h ? 0 : 4)" :y2="e.y2 + (e.h ? 4 : 0)"
        />
        <text v-if="e.label" class="elabel" :x="e.x1 + 14" :y="(e.y1 + e.y2) / 2 + 4">{{ e.label }}</text>
      </g>

      <g v-for="n in nodes" :key="n.id" :class="['node', nodeStatus(n.id)]">
        <rect :x="n.x - HW" :y="n.y - HH" :width="HW * 2" :height="HH * 2" />
        <circle class="lamp" :cx="n.x + HW - 12" :cy="n.y - HH + 12" r="5" />
        <text class="nlabel" :x="n.x" :y="n.y + 2" text-anchor="middle">{{ n.label }}</text>
        <text class="nsub" :x="n.x" :y="n.y + 18" text-anchor="middle">{{ n.sub }}</text>
      </g>
    </svg>

    <p class="status" role="status" aria-live="polite" :class="{ bad: broken }">
      <span class="pill" aria-hidden="true"></span>
      <span>{{ message }}</span>
    </p>
  </div>
</template>

<style scoped>
.mock { background: #fff; color: var(--navy-ink); font-family: var(--font-sans); box-shadow: 0 10px 40px rgba(11, 22, 64, 0.35); }
.chrome {
  display: flex; align-items: center; gap: 12px; padding: 8px 12px;
  border-bottom: 1px solid rgba(11, 22, 64, 0.12); background: var(--paper);
}
.lights { display: flex; gap: 6px; }
.lights i { width: 9px; height: 9px; display: block; background: rgba(11, 22, 64, 0.2); }
.title { font-family: var(--font-mono); font-size: 11px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sim {
  font-family: var(--font-mono); font-size: 12px; padding: 7px 10px; cursor: pointer; border-radius: 0;
  border: 1px solid var(--navy-ink); background: var(--paper); color: var(--navy-ink);
}
.sim:hover, .sim.on { background: var(--navy-ink); color: var(--paper); }
svg { display: block; width: 100%; height: auto; }

.edge .ties { stroke-width: 14; stroke-dasharray: 3 9; fill: none; }
.edge .rail { stroke-width: 2; }
.edge.ok .ties { stroke: var(--status-ok); opacity: 0.45; }
.edge.ok .rail { stroke: var(--status-ok); }
.edge.bad .ties { stroke: var(--status-bad); opacity: 0.55; }
.edge.bad .rail { stroke: var(--status-bad); }
.elabel { font-family: var(--font-mono); font-size: 12px; fill: var(--navy-ink); }

.node rect { fill: #fff; stroke-width: 1.5; }
.node.ok rect { stroke: rgba(11, 22, 64, 0.25); }
.node.bad rect { stroke: var(--status-bad); fill: #fdf1ef; }
.node.ok .lamp { fill: var(--status-ok); }
.node.bad .lamp { fill: var(--status-bad); animation: blink 0.9s steps(2, jump-none) infinite; }
.nlabel { font-family: var(--font-sans); font-weight: 600; font-size: 14px; fill: var(--navy-ink); }
.nsub { font-family: var(--font-sans); font-size: 10.5px; fill: rgba(11, 22, 64, 0.6); }
@keyframes blink { 50% { opacity: 0.15; } }

.status {
  display: flex; gap: 12px; align-items: flex-start; padding: 14px 16px; margin: 0;
  border-top: 1px solid rgba(11, 22, 64, 0.12); font-size: 14px; min-height: 76px; background: var(--paper);
}
.pill { flex: none; width: 10px; height: 10px; margin-top: 6px; background: var(--status-ok); }
.status.bad { background: #fdf1ef; }
.status.bad .pill { background: var(--status-bad); animation: blink 0.9s steps(2, jump-none) infinite; }
</style>
