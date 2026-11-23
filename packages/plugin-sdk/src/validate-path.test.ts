import { describe, it, expect } from 'vitest'
import { validatePath } from './validate-path.js'
import type { ProjectPath } from './types.js'

const valid: ProjectPath = {
  nodes: [
    { id: 'cf', integrationId: 'cloudflare', label: 'Cloudflare' },
    { id: 'vc', integrationId: 'vercel', label: 'Vercel' },
  ],
  edges: [{ id: 'e1', from: 'cf', to: 'vc', label: 'DNS' }],
}

describe('validatePath', () => {
  it('accepts a valid path', () => {
    expect(validatePath(valid)).toEqual([])
  })

  it('reports edges referencing unknown nodes', () => {
    const errors = validatePath({ ...valid, edges: [{ id: 'e1', from: 'cf', to: 'nope' }] })
    expect(errors).toEqual(['Edge "e1" references unknown node "nope" (to)'])
  })

  it('reports duplicate node and edge ids', () => {
    const errors = validatePath({
      nodes: [...valid.nodes, { id: 'cf', integrationId: 'cloudflare', label: 'Again' }],
      edges: [...valid.edges, { id: 'e1', from: 'vc', to: 'cf' }],
    })
    expect(errors).toContain('Duplicate node id "cf"')
    expect(errors).toContain('Duplicate edge id "e1"')
  })
})
