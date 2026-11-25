import type { CheckStatus, ProjectPath } from '@switchyard/plugin-sdk'

/** The same colors as CSS variables (defined in tokens.css), for scoped styles. */
export const STATUS_VARS: Record<CheckStatus, string> = {
  ok: 'var(--status-ok)',
  warning: 'var(--status-warn)',
  error: 'var(--status-bad)',
  unknown: 'var(--status-unknown)',
}

/** Readable status text colours (darker than the marker colours, for text on white). */
export const STATUS_TEXT_VARS: Record<CheckStatus, string> = {
  ok: 'var(--status-ok-text)',
  warning: 'var(--status-warn-text)',
  error: 'var(--status-bad-text)',
  unknown: 'var(--dash-muted)',
}

export const STATUS_LABELS: Record<CheckStatus, string> = {
  ok: 'OK',
  warning: 'Attention',
  error: 'Bloqué',
  unknown: 'Inconnu',
}

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

/** Longest path length from each node down to a sink (bounded, so cycles terminate). */
function computeDepths(path: ProjectPath): Map<string, number> {
  const depths = new Map<string, number>(path.nodes.map((n) => [n.id, 0]))
  for (let i = 0; i < path.nodes.length; i++) {
    let changed = false
    for (const edge of path.edges) {
      const next = (depths.get(edge.to) ?? 0) + 1
      if (
        depths.has(edge.from) &&
        next > (depths.get(edge.from) ?? 0) &&
        next < path.nodes.length
      ) {
        depths.set(edge.from, next)
        changed = true
      }
    }
    if (!changed) break
  }
  return depths
}

/**
 * Feeder nodes join the main line from below instead of sitting in column 0. A feeder is a root
 * (no incoming edge) with exactly one outgoing edge whose target is beyond column 0, and which
 * is not the main root. The main root is the root with the longest downstream path (the first in
 * path order on ties), so the line's own starting point is never a feeder.
 */
function findFeeders(path: ProjectPath, layers: Map<string, number>): Set<string> {
  const depths = computeDepths(path)
  const roots = path.nodes.filter((n) => !path.edges.some((e) => e.to === n.id))
  const mainRoot = roots.reduce<string | undefined>(
    (best, n) =>
      best === undefined || (depths.get(n.id) ?? 0) > (depths.get(best) ?? 0) ? n.id : best,
    undefined,
  )
  const feeders = new Set<string>()
  for (const root of roots) {
    if (root.id === mainRoot) continue
    const outgoing = path.edges.filter((e) => e.from === root.id)
    const target = outgoing.length === 1 ? outgoing[0]!.to : undefined
    if (target !== undefined && (layers.get(target) ?? 0) > 0) feeders.add(root.id)
  }
  return feeders
}

/** Grid cell of a node on the path plan: its column and its row within that column. */
export interface GridCell {
  col: number
  row: number
}

/**
 * Pure placement of a path on a grid. A node's column is the length of the longest path leading
 * to it; the main line takes row 0, and each feeder joins its target's column on the next free
 * row. The line plan turns these cells into world coordinates.
 */
export function pathGrid(path: ProjectPath): Map<string, GridCell> {
  const layers = computeLayers(path)
  const feeders = findFeeders(path, layers)
  const feederTarget = new Map<string, string>()
  for (const edge of path.edges) if (feeders.has(edge.from)) feederTarget.set(edge.from, edge.to)
  const rowsUsed = new Map<number, number>()
  const grid = new Map<string, GridCell>()

  const place = (id: string, col: number) => {
    const row = rowsUsed.get(col) ?? 0
    rowsUsed.set(col, row + 1)
    grid.set(id, { col, row })
  }
  // Main line first so feeders take the next free row of their target's column.
  for (const node of path.nodes) if (!feeders.has(node.id)) place(node.id, layers.get(node.id) ?? 0)
  for (const node of path.nodes) {
    if (feeders.has(node.id)) place(node.id, layers.get(feederTarget.get(node.id) ?? '') ?? 0)
  }
  return grid
}
