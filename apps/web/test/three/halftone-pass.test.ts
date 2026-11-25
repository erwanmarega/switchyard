import { describe, it, expect } from 'vitest'
import { HALFTONE_MIN_DARKNESS, dotRadius, toneColor } from '~/three/halftone-pass'

describe('toneColor', () => {
  it('maps darkness to a linear grey of 1 - darkness', () => {
    const c = toneColor(0.3)
    expect(c.r).toBeCloseTo(0.7)
    expect(c.g).toBeCloseTo(0.7)
    expect(c.b).toBeCloseTo(0.7)
  })

  it('clamps out-of-range darkness', () => {
    expect(toneColor(-1).r).toBe(1)
    expect(toneColor(2).r).toBe(0)
  })
})

describe('dotRadius', () => {
  it('is 0 below the threshold', () => {
    expect(dotRadius(0, 10)).toBe(0)
    expect(dotRadius(HALFTONE_MIN_DARKNESS / 2, 10)).toBe(0)
  })

  it('grows monotonically with darkness', () => {
    let prev = 0
    for (let d = 0.05; d <= 1; d += 0.05) {
      const r = dotRadius(d, 10)
      expect(r).toBeGreaterThan(prev)
      prev = r
    }
  })

  it('keeps dot area close to darkness * cell^2', () => {
    for (const d of [0.12, 0.3, 0.35, 0.5, 0.75]) {
      const r = dotRadius(d, 8)
      expect((Math.PI * r * r) / 64).toBeCloseTo(d, 5)
    }
  })

  it('scales with the cell size', () => {
    expect(dotRadius(0.5, 10)).toBeCloseTo(dotRadius(0.5, 5) * 2)
  })
})
