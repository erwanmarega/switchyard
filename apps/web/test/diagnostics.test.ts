import { describe, it, expect } from 'vitest'
import {
  checkCounts,
  formatCheckedAt,
  neighbours,
  worstCheckStatus,
  type NodeDiagnostic,
  formatClock,
  lastCheckedAt,
} from '../app/utils/diagnostics'
import { demoDiagnostics, demoPath, demoStatuses } from '../app/utils/demo-path'

describe('neighbours', () => {
  it('lists upstream and downstream labels from the path edges', () => {
    expect(neighbours(demoPath, 'vercel')).toEqual({
      upstream: ['Cloudflare', 'Stripe'],
      downstream: ['Supabase', 'Resend'],
    })
    expect(neighbours(demoPath, 'domain')).toEqual({ upstream: [], downstream: ['Cloudflare'] })
  })

  it('returns empty lists for an unknown node', () => {
    expect(neighbours(demoPath, 'nope')).toEqual({ upstream: [], downstream: [] })
  })
})

describe('checkCounts', () => {
  it('counts checks per status', () => {
    expect(checkCounts(demoDiagnostics.stripe!)).toEqual({
      ok: 1,
      warning: 0,
      error: 1,
      unknown: 0,
    })
  })
})

describe('formatCheckedAt', () => {
  it('formats in Paris time, deterministically', () => {
    expect(formatCheckedAt('2026-11-23T13:02:00Z')).toBe('23/11/2026 à 14h02')
    expect(formatCheckedAt('2026-07-01T10:05:00Z')).toBe('01/07/2026 à 12h05')
  })

  it('does not throw on an invalid date', () => {
    expect(formatCheckedAt('nope')).toBe('date inconnue')
  })
})

describe('demo diagnostics', () => {
  it('has a diagnostic for every demo node, consistent with its status', () => {
    for (const node of demoPath.nodes) {
      const diagnostic: NodeDiagnostic | undefined = demoDiagnostics[node.id]
      expect(diagnostic, node.id).toBeDefined()
      expect(worstCheckStatus(diagnostic!), node.id).toBe(demoStatuses[node.id])
    }
  })
})

describe('formatClock / lastCheckedAt', () => {
  it('formats the Paris clock', () => {
    expect(formatClock('2026-11-23T13:31:00Z')).toBe('14h31')
    expect(formatClock('2026-07-01T10:05:00Z')).toBe('12h05')
    expect(formatClock('nope')).toBe('heure inconnue')
  })

  it('returns the latest checkedAt, or null', () => {
    expect(lastCheckedAt(demoDiagnostics)).toBe('2026-11-23T13:31:00Z')
    expect(lastCheckedAt({})).toBeNull()
  })
})
