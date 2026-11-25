import { describe, it, expect } from 'vitest'
import {
  MAX_PARTICLES,
  STACK,
  coverMap,
  createSmoke,
  imageToView,
  printTone,
  toneAt,
  type Particle,
} from '../app/utils/smoke'

function run(seed: number, seconds: number) {
  const s = createSmoke(seed)
  for (let i = 0; i < seconds * 30; i++) s.step(1 / 30)
  return s
}

describe('coverMap', () => {
  it('fits height and right-aligns when the view is wider than tall', () => {
    const m = coverMap(2400, 1000, 2400, 1350)
    expect(m.scale).toBeCloseTo(1)
    expect(m.offsetX).toBeCloseTo(0)
    expect(m.offsetY).toBeCloseTo(-175)
  })

  it('crops on the left when the view is narrower', () => {
    const m = coverMap(600, 675, 2400, 1350)
    expect(m.scale).toBeCloseTo(0.5)
    expect(m.offsetX).toBeCloseTo(600 - 1200)
    expect(m.offsetY).toBeCloseTo(0)
    expect(imageToView(m, 2400, 1350)).toEqual({ x: 600, y: 675 })
  })
})

describe('createSmoke', () => {
  it('is deterministic for a given seed', () => {
    expect(run(7, 4).particles).toEqual(run(7, 4).particles)
  })

  it('emits at the stack, then rises and drifts left', () => {
    const s = createSmoke(3)
    s.step(0.01)
    const first = { ...s.particles[0]! }
    expect(Math.abs(first.x - STACK.x)).toBeLessThan(20)
    s.step(1.5)
    const same = s.particles.find((p) => p.phase === first.phase)!
    expect(same.y).toBeLessThan(first.y)
    expect(same.x).toBeLessThan(first.x)
    expect(same.radius).toBeGreaterThan(first.radius)
  })

  it('stays under the cap and removes dead particles', () => {
    const s = run(5, 20)
    expect(s.particles.length).toBeLessThanOrEqual(MAX_PARTICLES)
    expect(s.particles.length).toBeGreaterThan(0)
    expect(s.particles.every((p) => p.age < p.life)).toBe(true)
  })
})

describe('toneAt', () => {
  const p = (x: number, density: number): Particle => ({
    x,
    y: 500,
    radius: 100,
    density,
    age: 0,
    life: 6,
    vy0: -60,
    wind0: -25,
    phase: 0,
    radius1: 170,
    peak: density,
  })

  it('stays in [0, 1]', () => {
    const ps = Array.from({ length: 30 }, () => p(1000, 0.9))
    const t = toneAt(ps, 1000, 500)
    expect(t).toBeGreaterThanOrEqual(0)
    expect(t).toBeLessThanOrEqual(1)
  })

  it('is 0 far from particles', () => {
    expect(toneAt([p(1000, 0.9)], 2000, 0)).toBe(0)
  })

  it('is higher near a dense particle', () => {
    const ps = [p(1000, 0.9)]
    expect(toneAt(ps, 1000, 500)).toBeGreaterThan(toneAt(ps, 1060, 500))
    expect(toneAt(ps, 1060, 500)).toBeGreaterThan(toneAt(ps, 1140, 500))
  })
})

describe('printTone', () => {
  it('drops faint haze and caps the darkest tone', () => {
    expect(printTone(0)).toBe(0)
    expect(printTone(0.05)).toBe(0)
    expect(printTone(1)).toBeCloseTo(0.8)
  })

  it('is monotonic', () => {
    let prev = -1
    for (let t = 0; t <= 1; t += 0.05) {
      const v = printTone(t)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })
})
