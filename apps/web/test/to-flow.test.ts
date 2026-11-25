import { describe, it, expect } from 'vitest'
import type { ProjectPath } from '@switchyard/plugin-sdk'
import { demoPath } from '../app/utils/demo-path'
import { pathGrid } from '../app/utils/to-flow'

describe('pathGrid', () => {
  const grid = pathGrid(demoPath)
  const cell = (id: string) => grid.get(id)!

  it('places every node of the path', () => {
    expect(grid.size).toBe(demoPath.nodes.length)
  })

  it('keeps the main root (Domaine) in column 0 on the main row', () => {
    expect(cell('domain')).toEqual({ col: 0, row: 0 })
  })

  it('places downstream nodes in later columns', () => {
    expect(cell('cloudflare').col).toBeGreaterThan(cell('domain').col)
    expect(cell('vercel').col).toBeGreaterThan(cell('cloudflare').col)
    expect(cell('supabase').col).toBeGreaterThan(cell('vercel').col)
  })

  it('keeps the main line on row 0', () => {
    for (const id of ['domain', 'cloudflare', 'vercel', 'supabase']) expect(cell(id).row).toBe(0)
  })

  it('places a feeder (Stripe) in its target column, on the next row', () => {
    expect(cell('stripe').col).toBe(cell('vercel').col)
    expect(cell('stripe').row).toBe(1)
  })

  it('does not stack two nodes on the same cell', () => {
    const keys = new Set([...grid.values()].map((c) => `${c.col},${c.row}`))
    expect(keys.size).toBe(grid.size)
  })

  it('terminates on a cyclic path', () => {
    const path: ProjectPath = {
      nodes: [
        { id: 'a', integrationId: 'x', label: 'A' },
        { id: 'b', integrationId: 'x', label: 'B' },
      ],
      edges: [
        { id: 'e1', from: 'a', to: 'b' },
        { id: 'e2', from: 'b', to: 'a' },
      ],
    }
    expect(pathGrid(path).size).toBe(2)
  })
})
