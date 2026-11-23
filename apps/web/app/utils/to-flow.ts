import { Position } from '@vue-flow/core'
import type { CheckStatus, ProjectPath } from '@switchyard/plugin-sdk'

export interface FlowNode {
  id: string
  label: string
  position: { x: number; y: number }
  // Left-to-right path: edges leave on the right and enter on the left.
  sourcePosition: Position.Right
  targetPosition: Position.Left
  class: string
  data: { integrationId: string; status: CheckStatus; color: string }
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  label?: string
  animated: boolean
  style: { stroke: string }
}

export const STATUS_COLORS: Record<CheckStatus, string> = {
  ok: '#2e8b57',
  warning: '#e08a1e',
  error: '#c8372d',
  unknown: '#8a8f9c',
}

export const STATUS_LABELS: Record<CheckStatus, string> = {
  ok: 'Opérationnel',
  warning: 'Attention',
  error: 'En erreur',
  unknown: 'Inconnu',
}

export const statusClass = (status: CheckStatus): string => `sy-status-${status}`

const X_GAP = 260
const Y_GAP = 130

/** Assigns each node a column: the length of the longest path leading to it. */
function computeLayers(path: ProjectPath): Map<string, number> {
  const layers = new Map<string, number>(path.nodes.map((n) => [n.id, 0]))
  // Bounded relaxation so a cyclic path cannot loop forever.
  for (let i = 0; i < path.nodes.length; i++) {
    let changed = false
    for (const edge of path.edges) {
      const next = (layers.get(edge.from) ?? 0) + 1
      if (layers.has(edge.to) && next > (layers.get(edge.to) ?? 0) && next < path.nodes.length) {
        layers.set(edge.to, next)
        changed = true
      }
    }
    if (!changed) break
  }
  return layers
}

/** Pure conversion of a ProjectPath and its statuses into Vue Flow nodes and edges. */
export function toFlowElements(
  path: ProjectPath,
  statuses: Partial<Record<string, CheckStatus>> = {},
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const layers = computeLayers(path)
  const rowsUsed = new Map<number, number>()

  const nodes = path.nodes.map((node): FlowNode => {
    const layer = layers.get(node.id) ?? 0
    const row = rowsUsed.get(layer) ?? 0
    rowsUsed.set(layer, row + 1)
    const status = statuses[node.id] ?? 'unknown'
    return {
      id: node.id,
      label: node.label,
      position: { x: layer * X_GAP, y: row * Y_GAP },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      class: `sy-node ${statusClass(status)}`,
      data: { integrationId: node.integrationId, status, color: STATUS_COLORS[status] },
    }
  })

  const edges = path.edges.map((edge): FlowEdge => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    label: edge.label,
    animated: statuses[edge.from] === 'error' || statuses[edge.to] === 'error',
    style: { stroke: STATUS_COLORS[statuses[edge.from] ?? 'unknown'] },
  }))

  return { nodes, edges }
}
