import { describe, it, expect } from 'vitest'
import type { ProjectPath } from '@switchyard/plugin-sdk'
import { demoPath, demoStatuses } from '../app/utils/demo-path'
import { STATUS_COLORS, statusClass, toFlowElements } from '../app/utils/to-flow'

describe('toFlowElements', () => {
  const { nodes, edges } = toFlowElements(demoPath, demoStatuses)

  it('creates one node and one edge per path element', () => {
    expect(nodes).toHaveLength(demoPath.nodes.length)
    expect(edges).toHaveLength(demoPath.edges.length)
  })

  it('anchors edges left-to-right on every node', () => {
    for (const node of nodes) {
      expect(node.sourcePosition).toBe('right')
      expect(node.targetPosition).toBe('left')
    }
  })

  it('gives every node a numeric position', () => {
    for (const node of nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true)
      expect(Number.isFinite(node.position.y)).toBe(true)
    }
  })

  it('does not stack two nodes on the same position', () => {
    const keys = new Set(nodes.map((n) => `${n.position.x},${n.position.y}`))
    expect(keys.size).toBe(nodes.length)
  })

  it('places downstream nodes to the right of upstream ones', () => {
    const x = (id: string) => nodes.find((n) => n.id === id)!.position.x
    expect(x('cloudflare')).toBeGreaterThan(x('domain'))
    expect(x('vercel')).toBeGreaterThan(x('cloudflare'))
    expect(x('database')).toBeGreaterThan(x('vercel'))
  })

  it('maps from/to to source/target', () => {
    expect(edges.find((e) => e.id === 'e-stripe-vercel')).toMatchObject({
      source: 'stripe',
      target: 'vercel',
      label: 'Webhooks',
    })
  })

  it('maps statuses to classes and colors', () => {
    const byId = (id: string) => nodes.find((n) => n.id === id)!
    expect(byId('domain').class).toContain('sy-status-ok')
    expect(byId('domain').data.color).toBe(STATUS_COLORS.ok)
    expect(byId('vercel').class).toContain('sy-status-warning')
    expect(byId('vercel').data.color).toBe(STATUS_COLORS.warning)
    expect(byId('stripe').class).toContain('sy-status-error')
    expect(byId('stripe').data.color).toBe(STATUS_COLORS.error)
    expect(byId('database').class).toContain('sy-status-unknown')
    expect(byId('database').data.color).toBe(STATUS_COLORS.unknown)
  })

  it('defaults to unknown when a node has no status', () => {
    const path: ProjectPath = {
      nodes: [{ id: 'a', integrationId: 'x', label: 'A' }],
      edges: [],
    }
    expect(toFlowElements(path, {}).nodes[0]?.data.status).toBe('unknown')
    expect(statusClass('unknown')).toBe('sy-status-unknown')
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
    expect(toFlowElements(path).nodes).toHaveLength(2)
  })
})
