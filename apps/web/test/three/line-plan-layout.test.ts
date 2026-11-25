import { describe, it, expect } from 'vitest'
import type { CheckStatus, ProjectPath } from '@switchyard/plugin-sdk'
import { computeLinePlan } from '~/three/line-plan-layout'
import { demoHealthyStatuses, demoPath, demoProject, demoStatuses } from '~/utils/demo-path'

const incident = demoProject.incident!
const plan = () => computeLinePlan(demoPath, demoStatuses, incident)
const station = (layout: ReturnType<typeof plan>, id: string) =>
  layout.stations.find((s) => s.id === id)!

describe('computeLinePlan stations', () => {
  it('puts the main line on z=0, ordered by x and centred', () => {
    const main = plan().stations.filter((s) => s.onMain)
    expect(main.map((s) => s.id)).toEqual(['domain', 'cloudflare', 'vercel', 'supabase'])
    expect(main.every((s) => s.z === 0)).toBe(true)
    const xs = main.map((s) => s.x)
    expect([...xs].sort((a, b) => a - b)).toEqual(xs)
    expect(xs[0]! + xs[xs.length - 1]!).toBeCloseTo(0)
    expect(xs[1]! - xs[0]!).toBeGreaterThan(2.2)
  })

  it('places the feeder above the line with a horizontal then 45 degree route to the target', () => {
    const layout = plan()
    const stripe = station(layout, 'stripe')
    const vercel = station(layout, 'vercel')
    expect(stripe.onMain).toBe(false)
    expect(stripe.z).toBeLessThan(0)
    const track = layout.tracks.find((t) => t.edgeId === 'e-stripe-vercel')!
    expect(track.points).toHaveLength(3)
    const [start, kink, end] = track.points as [number, number][]
    expect(start).toEqual([stripe.x, stripe.z])
    expect(kink[1]).toBe(start[1])
    expect(kink[0]).toBeGreaterThan(start[0])
    expect(end).toEqual([vercel.x, vercel.z])
    expect(end[0] - kink[0]).toBeCloseTo(end[1] - kink[1])
    expect(layout.joints).toContainEqual(kink)
  })

  it('places the downstream branch below the line after a junction on the main line', () => {
    const layout = plan()
    const resend = station(layout, 'resend')
    const vercel = station(layout, 'vercel')
    expect(resend.z).toBeGreaterThan(0)
    const track = layout.tracks.find((t) => t.edgeId === 'e-vercel-resend')!
    const [start, junction, kink, end] = track.points as [number, number][]
    expect(start).toEqual([vercel.x, 0])
    expect(junction[1]).toBe(0)
    expect(junction[0]).toBeGreaterThan(vercel.x)
    expect(kink[0] - junction[0]).toBeCloseTo(kink[1] - junction[1])
    expect(end).toEqual([resend.x, resend.z])
    expect(end[1]).toBe(kink[1])
    expect(resend.x).toBeGreaterThanOrEqual(kink[0])
    expect(layout.joints).toContainEqual(junction)
    expect(layout.joints).toContainEqual(kink)
  })

  it('never overlaps two stations', () => {
    const { stations } = plan()
    for (const a of stations) {
      for (const b of stations) {
        if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(1)
      }
    }
  })

  it('keeps the bounds around every station', () => {
    const { stations, bounds } = plan()
    for (const s of stations) {
      expect(s.x).toBeGreaterThan(bounds.minX)
      expect(s.x).toBeLessThan(bounds.maxX)
      expect(s.z).toBeGreaterThan(bounds.minZ)
      expect(s.z).toBeLessThan(bounds.maxZ)
    }
  })
})

describe('computeLinePlan tracks and flows', () => {
  it('marks the broken track and dims the others during an incident', () => {
    const { tracks } = plan()
    const broken = tracks.filter((t) => t.broken)
    expect(broken.map((t) => t.edgeId)).toEqual(['e-stripe-vercel'])
    expect(broken[0]!.dim).toBe(false)
    expect(tracks.filter((t) => !t.broken).every((t) => t.dim)).toBe(true)
  })

  it('has nothing broken or dim when healthy without incident', () => {
    const { tracks, flows } = computeLinePlan(demoPath, demoHealthyStatuses, null)
    expect(tracks.every((t) => !t.broken && !t.dim)).toBe(true)
    expect(flows.every((f) => !f.broken && f.cutAt === undefined)).toBe(true)
  })

  it('breaks the edges whose both ends are in error when there is no incident', () => {
    const statuses: Record<string, CheckStatus> = {
      ...demoHealthyStatuses,
      stripe: 'error',
      vercel: 'error',
    }
    const { tracks } = computeLinePlan(demoPath, statuses, null)
    expect(tracks.filter((t) => t.broken).map((t) => t.edgeId)).toEqual(['e-stripe-vercel'])
    expect(tracks.some((t) => t.dim)).toBe(false)
  })

  it('builds the main, branch and feeder flows with a cut on the broken feeder', () => {
    const { flows } = plan()
    expect(flows).toHaveLength(3)
    expect(flows[0]!.points).toHaveLength(4)
    expect(flows[0]!.broken).toBe(false)
    const broken = flows.filter((f) => f.broken)
    expect(broken).toHaveLength(1)
    expect(broken[0]!.cutAt).toBe(0.55)
    expect(broken[0]!.points).toHaveLength(3)
  })
})

describe('computeLinePlan odd graphs', () => {
  const node = (id: string) => ({ id, integrationId: id, label: id })

  it('does not throw on cycles, isolated nodes, empty paths or dangling edges', () => {
    const cycle: ProjectPath = {
      nodes: [node('a'), node('b'), node('c'), node('lonely')],
      edges: [
        { id: 'ab', from: 'a', to: 'b' },
        { id: 'bc', from: 'b', to: 'c' },
        { id: 'ca', from: 'c', to: 'a' },
        { id: 'gone', from: 'a', to: 'nope' },
      ],
    }
    const layout = computeLinePlan(cycle, {}, null)
    expect(layout.stations).toHaveLength(4)
    for (const s of layout.stations) {
      expect(Number.isFinite(s.x) && Number.isFinite(s.z)).toBe(true)
    }
    expect(layout.tracks.every((t) => t.points.length >= 2)).toBe(true)
    expect(() => computeLinePlan({ nodes: [], edges: [] }, {}, null)).not.toThrow()
    expect(() => computeLinePlan({ nodes: [node('solo')], edges: [] }, {}, incident)).not.toThrow()
  })
})
