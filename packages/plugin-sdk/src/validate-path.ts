import type { ProjectPath } from './types.js'

/** Returns a list of problems found in the path; an empty list means it is valid. */
export function validatePath(path: ProjectPath): string[] {
  const errors: string[] = []

  const nodeIds = new Set<string>()
  for (const node of path.nodes) {
    if (nodeIds.has(node.id)) errors.push(`Duplicate node id "${node.id}"`)
    nodeIds.add(node.id)
  }

  const edgeIds = new Set<string>()
  for (const edge of path.edges) {
    if (edgeIds.has(edge.id)) errors.push(`Duplicate edge id "${edge.id}"`)
    edgeIds.add(edge.id)
    if (!nodeIds.has(edge.from)) {
      errors.push(`Edge "${edge.id}" references unknown node "${edge.from}" (from)`)
    }
    if (!nodeIds.has(edge.to)) {
      errors.push(`Edge "${edge.id}" references unknown node "${edge.to}" (to)`)
    }
  }

  return errors
}
