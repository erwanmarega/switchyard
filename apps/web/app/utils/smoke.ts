// Steam smoke for the hero: pure particle simulation in image pixel units (no DOM).

export const IMG_W = 2400
export const IMG_H = 1350
export const STACK = { x: 1975, y: 402 }
export const SMOKE_CELL_IMG_PX = 5
export const SMOKE_ANGLE = Math.PI / 4
export const MAX_PARTICLES = 60

const CHUFF_INTERVAL = 0.5
const GAUSS_K = 2.2
/** Kept well below 1 so overlapping puffs stay airy instead of a solid cloud. */
const PEAK_DENSITY = 0.5

export interface CoverMap {
  scale: number
  offsetX: number
  offsetY: number
}

/** object-fit: cover + object-position: right center. */
export function coverMap(viewW: number, viewH: number, imgW = IMG_W, imgH = IMG_H): CoverMap {
  const scale = Math.max(viewW / imgW, viewH / imgH)
  return { scale, offsetX: viewW - imgW * scale, offsetY: (viewH - imgH * scale) / 2 }
}

export function imageToView(m: CoverMap, x: number, y: number): { x: number; y: number } {
  return { x: x * m.scale + m.offsetX, y: y * m.scale + m.offsetY }
}

export interface Particle {
  x: number
  y: number
  radius: number
  density: number
  age: number
  life: number
  vy0: number
  wind0: number
  phase: number
  radius1: number
  /** Per-puff peak density: uneven puffs read as billows rather than one smooth plume. */
  peak: number
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Smoke {
  particles: Particle[]
  step(dt: number): void
}

export function createSmoke(seed = 1): Smoke {
  const rand = mulberry32(seed)
  const particles: Particle[] = []
  let untilChuff = 0

  function emit() {
    const n = 1 + Math.floor(rand() * 2)
    for (let i = 0; i < n; i++) {
      if (particles.length >= MAX_PARTICLES) return
      particles.push({
        x: STACK.x + (rand() - 0.5) * 20,
        y: STACK.y - rand() * 10,
        radius: 26,
        density: 0,
        age: 0,
        life: 5 + rand() * 2,
        vy0: -(30 + rand() * 30),
        wind0: -(35 + rand() * 15),
        phase: rand() * Math.PI * 2,
        radius1: 70 + rand() * 60,
        peak: PEAK_DENSITY * (0.55 + rand() * 0.45),
      })
    }
  }

  function advance(dt: number) {
    untilChuff -= dt
    while (untilChuff <= 0) {
      emit()
      untilChuff += CHUFF_INTERVAL
    }
    let w = 0
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]!
      p.age += dt
      if (p.age >= p.life) continue
      const t = p.age / p.life
      // Rises, then bends back: the train runs right, so the plume trails left.
      p.y += p.vy0 * (1 - 0.8 * t) * dt
      p.x += (p.wind0 - 90 * t + Math.sin(p.age * 1.7 + p.phase) * 18) * dt
      p.radius = 26 + (p.radius1 - 26) * Math.sqrt(t)
      // Short fade-in avoids a hard spawn, then a slow fade-out.
      p.density = p.peak * Math.min(1, t * 25) * (1 - t) ** 1.5
      particles[w++] = p
    }
    particles.length = w
  }

  return {
    particles,
    step(dt: number) {
      // sub-step large dt so bursts stay regular
      let left = dt
      while (left > 0) {
        const d = Math.min(left, 0.1)
        advance(d)
        left -= d
      }
    },
  }
}

/** Combined density at an image point: 1 - prod(1 - a_i), in [0, 1]. */
export function toneAt(particles: readonly Particle[], x: number, y: number): number {
  let keep = 1
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]!
    const dx = x - p.x
    const dy = y - p.y
    const r2 = p.radius * p.radius
    const d2 = dx * dx + dy * dy
    if (d2 > r2 * 2.25) continue
    keep *= 1 - p.density * Math.exp((-GAUSS_K * d2) / r2)
  }
  return Math.min(1, Math.max(0, 1 - keep))
}

/**
 * Print curve applied before the dot screen: drops the faint tails (which otherwise print as a
 * uniform haze) and stretches the mid tones so individual puffs read as billows.
 */
export function printTone(tone: number): number {
  const t = Math.min(1, Math.max(0, (tone - 0.08) / (0.55 - 0.08)))
  return 0.8 * t * t * (3 - 2 * t)
}
