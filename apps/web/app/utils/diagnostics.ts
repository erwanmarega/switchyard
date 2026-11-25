import type { InjectionKey } from 'vue'
import type { CheckStatus, ProjectPath } from '@switchyard/plugin-sdk'

export interface DiagnosticCheck {
  id: string
  label: string
  status: CheckStatus
  detail: string
}

/** One step of the "Remonter vers" trace, from the symptom up to the probable cause. */
export interface TraceStep {
  /** "Vercel · /api/stripe" */
  label: string
  /** Muted text after the label, e.g. "symptôme". */
  role?: string
  detail: string
  /** True for the probable cause: tag and filled marker. */
  cause?: boolean
  /** Marker colour. */
  status: CheckStatus
}

export interface NodeDiagnostic {
  summary: string
  /** ISO 8601 date of the last verification. */
  checkedAt: string
  checks: DiagnosticCheck[]
  lastError?: { at: string; message: string; code?: string }
  suggestion?: string
  /** One-line status under the station name on the plan: "OK · expire dans 210 j". */
  statusLine?: string
  /** What this service is in the project: "Hébergement et API · environnement production". */
  description?: string
  /** ISO date since which the current status holds (for "Bloqué depuis 14h02"). */
  since?: string
  /** Link to the provider console. */
  console?: { label: string; url: string }
  /** "Remonter vers": from the symptom up to the probable cause. */
  trace?: TraceStep[]
}

export interface ProjectIncident {
  /** Banner text; `highlight` (if any) is a substring rendered bold. */
  message: string
  highlight?: string
  /** ISO date the incident started. */
  since: string
  causeNodeId: string
  symptomNodeId: string
  /** Edges drawn as "voie coupée". */
  brokenEdgeIds: string[]
  /** Short tag on the plan next to the cause: "DÉPLOIEMENT 14H02". */
  causeTag: string
  /** Optional action under the trace. */
  action?: { label: string; url: string }
}

export interface ProjectOverviewData {
  name: string
  incident: ProjectIncident | null
  deadlines: { label: string; value: string }[]
  /** ISO date of the next scheduled check. */
  nextCheckAt: string
}

export interface NeighbourNode {
  id: string
  label: string
}

/** Provided by PathGraph so a wagon button can ask for its interior to be opened. */
export type OpenWagon = (nodeId: string, trigger: HTMLElement) => void
export const OPEN_WAGON_KEY = Symbol('open-wagon') as InjectionKey<OpenWagon>

const SEVERITY: Record<CheckStatus, number> = { ok: 0, unknown: 1, warning: 2, error: 3 }

/** Nodes directly before (upstream) and after (downstream) a node, in path order. */
export function neighbourNodes(
  path: ProjectPath,
  nodeId: string,
): { upstream: NeighbourNode[]; downstream: NeighbourNode[] } {
  const pick = (ids: string[]): NeighbourNode[] =>
    path.nodes.filter((n) => ids.includes(n.id)).map((n) => ({ id: n.id, label: n.label }))
  return {
    upstream: pick(path.edges.filter((e) => e.to === nodeId).map((e) => e.from)),
    downstream: pick(path.edges.filter((e) => e.from === nodeId).map((e) => e.to)),
  }
}

/** Labels of the upstream and downstream neighbours of a node. */
export function neighbours(
  path: ProjectPath,
  nodeId: string,
): { upstream: string[]; downstream: string[] } {
  const { upstream, downstream } = neighbourNodes(path, nodeId)
  return { upstream: upstream.map((n) => n.label), downstream: downstream.map((n) => n.label) }
}

export function checkCounts(diagnostic: NodeDiagnostic): Record<CheckStatus, number> {
  const counts: Record<CheckStatus, number> = { ok: 0, warning: 0, error: 0, unknown: 0 }
  for (const check of diagnostic.checks) counts[check.status]++
  return counts
}

/** Worst status among the checks (error > warning > unknown > ok); no check means unknown. */
export function worstCheckStatus(diagnostic: NodeDiagnostic): CheckStatus {
  if (diagnostic.checks.length === 0) return 'unknown'
  return diagnostic.checks.reduce<CheckStatus>(
    (worst, c) => (SEVERITY[c.status] > SEVERITY[worst] ? c.status : worst),
    'ok',
  )
}

const parisFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** Deterministic French date, Paris time: "23/11/2026 à 14h02". */
export function formatCheckedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'date inconnue'
  const part = (type: string) => parisFormat.formatToParts(date).find((p) => p.type === type)!.value
  return `${part('day')}/${part('month')}/${part('year')} à ${part('hour')}h${part('minute')}`
}

const clockFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** Deterministic Paris clock time: "14h31". */
export function formatClock(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'heure inconnue'
  const part = (type: string) => clockFormat.formatToParts(date).find((p) => p.type === type)!.value
  return `${part('hour')}h${part('minute')}`
}

/** Latest checkedAt among the diagnostics, or null when there is none. */
export function lastCheckedAt(diagnostics: Record<string, NodeDiagnostic>): string | null {
  let latest: string | null = null
  let latestTime = -Infinity
  for (const d of Object.values(diagnostics)) {
    const time = Date.parse(d.checkedAt)
    if (!Number.isNaN(time) && time > latestTime) {
      latest = d.checkedAt
      latestTime = time
    }
  }
  return latest
}
