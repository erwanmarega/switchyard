<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import {
  SMOKE_ANGLE,
  SMOKE_CELL_IMG_PX,
  coverMap,
  createSmoke,
  printTone,
  toneAt,
  type Particle,
} from '../../utils/smoke'

const canvas = ref<HTMLCanvasElement | null>(null)

const COLOR = '#f4f1e8'
const MIN_TONE = 0.02
const PREWARM_S = 6

let cleanup: (() => void) | null = null

onMounted(() => {
  const el = canvas.value
  const ctx = el?.getContext('2d')
  if (!el || !ctx) return

  const smoke = createSmoke(Math.floor(Math.random() * 2 ** 31))
  smoke.step(PREWARM_S)

  const cos = Math.cos(SMOKE_ANGLE)
  const sin = Math.sin(SMOKE_ANGLE)
  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  let reduced = reduceQuery.matches
  let cssW = 0
  let cssH = 0
  let raf = 0
  let last = 0
  let onScreen = true

  function resize() {
    if (!el || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    cssW = el.clientWidth
    cssH = el.clientHeight
    el.width = Math.max(1, Math.round(cssW * dpr))
    el.height = Math.max(1, Math.round(cssH * dpr))
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = COLOR
    draw()
  }

  function draw() {
    if (!ctx || !cssW || !cssH) return
    ctx.clearRect(0, 0, cssW, cssH)
    const ps: Particle[] = smoke.particles
    if (!ps.length) return
    const m = coverMap(cssW, cssH)
    const cell = SMOKE_CELL_IMG_PX * m.scale

    // bounding box of particles (view coords), then in rotated (u, v) cell space
    let uMin = Infinity
    let uMax = -Infinity
    let vMin = Infinity
    let vMax = -Infinity
    for (const p of ps) {
      const r = p.radius * 1.5 * m.scale
      const vx = p.x * m.scale + m.offsetX
      const vy = p.y * m.scale + m.offsetY
      const u = (vx * cos + vy * sin) / cell
      const v = (-vx * sin + vy * cos) / cell
      // rotated-space half extent of a circle of radius r is r in both axes
      const rc = r / cell
      if (u - rc < uMin) uMin = u - rc
      if (u + rc > uMax) uMax = u + rc
      if (v - rc < vMin) vMin = v - rc
      if (v + rc > vMax) vMax = v + rc
    }

    ctx.beginPath()
    const inv = 1 / m.scale
    for (let i = Math.floor(uMin); i <= Math.ceil(uMax); i++) {
      for (let j = Math.floor(vMin); j <= Math.ceil(vMax); j++) {
        const cu = (i + 0.5) * cell
        const cv = (j + 0.5) * cell
        const vx = cu * cos - cv * sin
        const vy = cu * sin + cv * cos
        if (vx < -cell || vx > cssW + cell || vy < -cell || vy > cssH + cell) continue
        const tone = printTone(toneAt(ps, (vx - m.offsetX) * inv, (vy - m.offsetY) * inv))
        if (tone < MIN_TONE) continue
        const r = Math.sqrt(tone / Math.PI) * cell
        ctx.moveTo(vx + r, vy)
        ctx.arc(vx, vy, r, 0, Math.PI * 2)
      }
    }
    ctx.fill()
  }

  function frame(now: number) {
    raf = 0
    const dt = Math.min((now - last) / 1000, 0.1)
    last = now
    smoke.step(dt)
    draw()
    schedule()
  }

  function schedule() {
    if (raf || reduced || !onScreen || document.hidden) return
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  }

  const ro = new ResizeObserver(resize)
  if (el.parentElement) ro.observe(el.parentElement)

  const io = new IntersectionObserver((entries) => {
    onScreen = entries.some((e) => e.isIntersecting)
    if (onScreen) schedule()
    else stop()
  })
  io.observe(el)

  function onVisibility() {
    if (document.hidden) stop()
    else schedule()
  }
  document.addEventListener('visibilitychange', onVisibility)

  function onMotion(e: MediaQueryListEvent) {
    reduced = e.matches
    if (reduced) {
      stop()
      draw()
    } else schedule()
  }
  reduceQuery.addEventListener('change', onMotion)

  resize()
  schedule()

  cleanup = () => {
    stop()
    ro.disconnect()
    io.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
    reduceQuery.removeEventListener('change', onMotion)
  }
})

onBeforeUnmount(() => cleanup?.())
</script>

<template>
  <canvas ref="canvas" class="smoke" aria-hidden="true"></canvas>
</template>

<style scoped>
.smoke {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
