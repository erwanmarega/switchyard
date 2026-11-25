import type { CheckStatus, ProjectPath } from '@switchyard/plugin-sdk'
import type { ProjectIncident } from '~/utils/diagnostics'
import { pathGrid } from '~/utils/to-flow'

/** A point on the ground plane: [x, z] in world units. */
export type Point2 = [number, number]

export interface LineStation {
  id: string
  label: string
  status: CheckStatus
  x: number
  z: number
  /** True for stations on the main line (flow row 0). */
  onMain: boolean
}

export interface LineTrack {
  edgeId: string | null
  points: Point2[]
  broken: boolean
  dim: boolean
}

export interface LineFlow {
  points: Point2[]
  broken: boolean
  /** Fraction (0..1) of the path at which packets vanish when the flow is broken. */
  cutAt?: number
}

export interface LinePlanBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface LinePlanLayout {
  stations: LineStation[]
  tracks: LineTrack[]
  joints: Point2[]
  flows: LineFlow[]
  bounds: LinePlanBounds
}

// Tunables, in world units (the design uses ~2.3-3 between main stations, +-1.3 for branch rows).
/** Distance between two columns of the main line. */
export const COLUMN_GAP = 3
/** Distance between the main line and the first branch / feeder row. */
export const ROW_GAP = 1.9
/** Minimum distance between two stations on the same row. */
const MIN_STATION_GAP = 1.9
/** Straight run between the source station and the start of a branch diagonal. */
const BRANCH_LEAD = 0.5
/** Straight run between the end of a branch diagonal and the branch station. */
const BRANCH_TAIL = 1
/** Station radius, used for the bounds. */
const STATION_RADIUS = 0.3
/** Where packets vanish on a broken flow. */
export const CUT_AT = 0.55

const sameRow = (a: number, b: number) => Math.abs(a - b) < 1e-6

function polylineLength(points: Point2[]): number {
  let total = 0
  for (let i = 0; i < points.length - 1; i++) {
    total += Math.hypot(points[i + 1]![0] - points[i]![0], points[i + 1]![1] - points[i]![1])
  }
  return total
}

/**
 * Pure layout of the "plan de ligne": main line along +x, feeders above it (negative z), other
 * branches below it (positive z), with octilinear (horizontal + 45 degrees) routes.
 */
export function computeLinePlan(
  path: ProjectPath,
  statuses: Partial<Record<string, CheckStatus>>,
  incident: ProjectIncident | null,
): LinePlanLayout {
  const grid = pathGrid(path)
  const nodeIds = new Set(path.nodes.map((n) => n.id))
  const edges = path.edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
  const hasIncoming = (id: string) => edges.some((e) => e.to === id)
  const rowOf = (id: string) => grid.get(id)?.row ?? 0

  const mainNodes = path.nodes.filter((n) => rowOf(n.id) === 0)
  const cols = mainNodes.map((n) => grid.get(n.id)?.col ?? 0)
  const midCol = cols.length ? (Math.min(...cols) + Math.max(...cols)) / 2 : 0

  const pos = new Map<string, Point2>()
  for (const n of mainNodes) pos.set(n.id, [((grid.get(n.id)?.col ?? 0) - midCol) * COLUMN_GAP, 0])

  // Stations already placed per row (z), to keep a row free of overlaps.
  const occupied = new Map<number, number[]>()
  const rowFree = (z: number, x: number) =>
    (occupied.get(z) ?? []).every((o) => Math.abs(o - x) >= MIN_STATION_GAP)
  const occupy = (z: number, x: number) => occupied.set(z, [...(occupied.get(z) ?? []), x])
  for (const p of pos.values()) occupy(p[1], p[0])

  const routes = new Map<string, Point2[]>() // edge id -> octilinear route
  const feederEdge = new Map<string, string>() // feeder id -> edge id
  const branchEdge = new Map<string, string>() // branch id -> edge id

  const offMain = path.nodes.filter((n) => rowOf(n.id) !== 0)
  const feeders = offMain.filter(
    (n) => !hasIncoming(n.id) && edges.some((e) => e.from === n.id && pos.has(e.to)),
  )
  const feederIds = new Set(feeders.map((n) => n.id))

  // Feeders: row above the line, horizontal run then a 45 degree diagonal into the target.
  for (const node of feeders) {
    const edge = edges.find((e) => e.from === node.id && pos.has(e.to))!
    const target = pos.get(edge.to)!
    for (let k = 1; k < 50; k++) {
      const z = -ROW_GAP * k
      const dz = target[1] - z
      const x = target[0] - COLUMN_GAP - ROW_GAP * (k - 1)
      if (!rowFree(z, x)) continue
      pos.set(node.id, [x, z])
      occupy(z, x)
      routes.set(edge.id, [[x, z], [target[0] - dz, z], target])
      feederEdge.set(node.id, edge.id)
      break
    }
  }

  // Other off-main nodes: row below the line, junction on the line, 45 degrees down, horizontal.
  for (const node of offMain) {
    if (feederIds.has(node.id)) continue
    const edge = edges.find((e) => e.to === node.id && pos.has(e.from))
    const source = edge ? pos.get(edge.from) : undefined
    const colX = ((grid.get(node.id)?.col ?? 0) - midCol) * COLUMN_GAP
    for (let k = 1; k < 50; k++) {
      const z = ROW_GAP * k
      let x = colX
      let route: Point2[] | undefined
      if (source && edge) {
        const dz = z - source[1]
        const junctionX = Math.max(source[0] + BRANCH_LEAD, colX - BRANCH_TAIL - dz)
        const kinkX = junctionX + dz
        x = Math.max(colX, kinkX + BRANCH_TAIL)
        route = [source, [junctionX, source[1]], [kinkX, z], [x, z]]
      }
      if (!rowFree(z, x)) continue
      pos.set(node.id, [x, z])
      occupy(z, x)
      if (edge && route) {
        routes.set(edge.id, route)
        branchEdge.set(node.id, edge.id)
      }
      break
    }
    // No free row (cannot happen in practice): park the node on the far row.
    if (!pos.has(node.id)) pos.set(node.id, [colX, ROW_GAP * 50])
  }

  const stations: LineStation[] = path.nodes.map((n) => {
    const p = pos.get(n.id) ?? [0, 0]
    return {
      id: n.id,
      label: n.label,
      status: statuses[n.id] ?? 'unknown',
      x: p[0],
      z: p[1],
      onMain: rowOf(n.id) === 0,
    }
  })
  const stationAt = new Map(stations.map((s) => [s.id, s]))

  const isBroken = (edge: { from: string; to: string; id: string }) =>
    incident
      ? incident.brokenEdgeIds.includes(edge.id)
      : statuses[edge.from] === 'error' && statuses[edge.to] === 'error'

  // One track per edge: the octilinear route when known, a straight segment otherwise.
  const tracks: LineTrack[] = edges.map((edge) => {
    const a = stationAt.get(edge.from)!
    const b = stationAt.get(edge.to)!
    const broken = isBroken(edge)
    return {
      edgeId: edge.id,
      points: routes.get(edge.id) ?? [
        [a.x, a.z],
        [b.x, b.z],
      ],
      broken,
      dim: incident !== null && !broken,
    }
  })
  const trackOf = new Map(tracks.map((t) => [t.edgeId, t]))

  // Joints at every bend and junction (interior points of the routes).
  const joints: Point2[] = []
  for (const track of tracks) {
    for (const p of track.points.slice(1, -1)) {
      if (!joints.some((j) => sameRow(j[0], p[0]) && sameRow(j[1], p[1]))) joints.push(p)
    }
  }

  const flows: LineFlow[] = []
  // Main line: stations on row 0, in x order.
  const mainStations = stations.filter((s) => s.onMain).sort((a, b) => a.x - b.x)
  if (mainStations.length >= 2) {
    const points = mainStations.map((s): Point2 => [s.x, s.z])
    const brokenMain = mainStations.flatMap((s, i) => {
      const next = mainStations[i + 1]
      const edge = next && edges.find((e) => e.from === s.id && e.to === next.id)
      return edge && trackOf.get(edge.id)?.broken ? [i] : []
    })[0]
    if (brokenMain === undefined) {
      flows.push({ points, broken: false })
    } else {
      const upTo = polylineLength(points.slice(0, brokenMain + 1))
      const mid = Math.hypot(
        points[brokenMain + 1]![0] - points[brokenMain]![0],
        points[brokenMain + 1]![1] - points[brokenMain]![1],
      )
      flows.push({
        points,
        broken: true,
        cutAt: Math.min(1, (upTo + mid * CUT_AT) / (polylineLength(points) || 1)),
      })
    }
  }
  // Each feeder and each branch: its own path.
  for (const edgeId of [...feederEdge.values(), ...branchEdge.values()]) {
    const track = trackOf.get(edgeId)
    if (!track) continue
    const { points } = track
    flows.push(track.broken ? { points, broken: true, cutAt: CUT_AT } : { points, broken: false })
  }

  const xs = stations.map((s) => s.x)
  const zs = stations.map((s) => s.z)
  for (const track of tracks) {
    for (const p of track.points) {
      xs.push(p[0])
      zs.push(p[1])
    }
  }
  const bounds: LinePlanBounds = xs.length
    ? {
        minX: Math.min(...xs) - STATION_RADIUS,
        maxX: Math.max(...xs) + STATION_RADIUS,
        minZ: Math.min(...zs) - STATION_RADIUS,
        maxZ: Math.max(...zs) + STATION_RADIUS,
      }
    : { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }

  return { stations, tracks, joints, flows, bounds }
}
