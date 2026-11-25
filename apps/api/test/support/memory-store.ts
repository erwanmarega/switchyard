import {
  LIMITS,
  LimitError,
  ValidationError,
  type CheckResultRecord,
  type ConnectionRecord,
  type NewCheckResult,
  type PathRecord,
  type ProjectRecord,
  type SchedulerStore,
  type Store,
} from '../../src/store/types.js'

export interface MemoryStore extends Store, SchedulerStore {
  /** Test-only: the raw sealed secrets stored for a connection (null if none / unknown). */
  rawSecrets(connectionId: string): string | null
  /** Test-only: every stored result of a connection, in insertion order. */
  rawResults(connectionId: string): CheckResultRecord[]
}

export interface MemoryStoreOptions {
  /** Epoch milliseconds, used for the scheduling logic (nextCheckAt). Defaults to Date.now. */
  now?: () => number
}

interface StoredResult extends CheckResultRecord {
  userId: string
  projectId: string
}

interface StoredConnection extends ConnectionRecord {
  userId: string
  secrets: string | null
  seq: number
  nextCheckAt: number
}

interface StoredProject extends ProjectRecord {
  userId: string
  seq: number
  path: PathRecord
}

function assertIntInRange(name: string, value: number, min: number, max: number) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer between ${min} and ${max}`)
  }
}

const publicResult = (r: StoredResult): CheckResultRecord => ({
  connectionId: r.connectionId,
  checkId: r.checkId,
  status: r.status,
  message: r.message,
  details: r.details === null ? null : structuredClone(r.details),
  checkedAt: r.checkedAt,
})

const byCreation = (a: { seq: number }, b: { seq: number }) => a.seq - b.seq
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** In-memory Store with the same semantics as the Postgres one (isolation, cascades, limits). */
export function createMemoryStore(options: MemoryStoreOptions = {}): MemoryStore {
  const schedulerNow = options.now ?? Date.now
  const results: StoredResult[] = []
  const projects = new Map<string, StoredProject>()
  const connections = new Map<string, StoredConnection>()
  const dropResults = (match: (r: StoredResult) => boolean) => {
    for (let i = results.length - 1; i >= 0; i--) if (match(results[i]!)) results.splice(i, 1)
  }
  let seq = 0
  let clock = Date.parse('2026-01-01T00:00:00.000Z')
  const now = () => new Date((clock += 1000)).toISOString()

  const project = (userId: string, id: string) => {
    const p = projects.get(id)
    return p && p.userId === userId ? p : null
  }
  const connection = (userId: string, projectId: string, id: string) => {
    const c = connections.get(id)
    return c && c.userId === userId && c.projectId === projectId ? c : null
  }
  const publicProject = (p: StoredProject): ProjectRecord => ({
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  })
  const publicConnection = (c: StoredConnection): ConnectionRecord => ({
    id: c.id,
    projectId: c.projectId,
    integrationId: c.integrationId,
    label: c.label,
    config: { ...c.config },
    hasSecrets: c.secrets !== null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  })

  return {
    rawSecrets: (id) => connections.get(id)?.secrets ?? null,
    rawResults: (id) => results.filter((r) => r.connectionId === id).map(publicResult),

    async listProjects(userId) {
      return [...projects.values()]
        .filter((p) => p.userId === userId)
        .sort(byCreation)
        .map(publicProject)
    },
    async getProject(userId, projectId) {
      const p = project(userId, projectId)
      return p ? publicProject(p) : null
    },
    async createProject(userId, name) {
      const owned = [...projects.values()].filter((p) => p.userId === userId).length
      if (owned >= LIMITS.projectsPerUser) {
        throw new LimitError(`Limite de ${LIMITS.projectsPerUser} projets atteinte.`)
      }
      const ts = now()
      const p: StoredProject = {
        id: crypto.randomUUID(),
        userId,
        name,
        createdAt: ts,
        updatedAt: ts,
        seq: seq++,
        path: { nodes: [], edges: [] },
      }
      projects.set(p.id, p)
      return publicProject(p)
    },
    async updateProject(userId, projectId, name) {
      const p = project(userId, projectId)
      if (!p) return null
      p.name = name
      p.updatedAt = now()
      return publicProject(p)
    },
    async deleteProject(userId, projectId) {
      if (!project(userId, projectId)) return false
      projects.delete(projectId)
      for (const [id, c] of connections) if (c.projectId === projectId) connections.delete(id)
      dropResults((r) => r.projectId === projectId)
      return true
    },

    async listConnections(userId, projectId) {
      if (!project(userId, projectId)) return null
      return [...connections.values()]
        .filter((c) => c.userId === userId && c.projectId === projectId)
        .sort(byCreation)
        .map(publicConnection)
    },
    async getConnection(userId, projectId, connectionId) {
      const c = connection(userId, projectId, connectionId)
      return c ? publicConnection(c) : null
    },
    async createConnection(userId, projectId, input) {
      if (!project(userId, projectId)) return null
      const count = [...connections.values()].filter(
        (c) => c.userId === userId && c.projectId === projectId,
      ).length
      if (count >= LIMITS.connectionsPerProject) {
        throw new LimitError(`Limite de ${LIMITS.connectionsPerProject} connexions atteinte.`)
      }
      const ts = now()
      const c: StoredConnection = {
        id: input.id,
        userId,
        projectId,
        integrationId: input.integrationId,
        label: input.label,
        config: { ...input.config },
        secrets: input.secrets,
        hasSecrets: input.secrets !== null,
        createdAt: ts,
        updatedAt: ts,
        seq: seq++,
        nextCheckAt: schedulerNow(),
      }
      connections.set(c.id, c)
      return publicConnection(c)
    },
    async updateConnection(userId, projectId, connectionId, patch) {
      const c = connection(userId, projectId, connectionId)
      if (!c) return null
      if (patch.label !== undefined) c.label = patch.label
      if (patch.credentials) {
        c.config = { ...patch.credentials.config }
        c.secrets = patch.credentials.secrets
        c.nextCheckAt = schedulerNow()
      }
      c.updatedAt = now()
      return publicConnection(c)
    },
    async deleteConnection(userId, projectId, connectionId) {
      if (!connection(userId, projectId, connectionId)) return false
      connections.delete(connectionId)
      dropResults((r) => r.connectionId === connectionId)
      for (const node of projects.get(projectId)?.path.nodes ?? []) {
        if (node.connectionId === connectionId) node.connectionId = null
      }
      return true
    },
    async getConnectionSecrets(userId, projectId, connectionId) {
      return connection(userId, projectId, connectionId)?.secrets ?? null
    },

    async getConnectionForRun(userId, projectId, connectionId) {
      const c = connection(userId, projectId, connectionId)
      if (!c) return null
      return {
        id: c.id,
        projectId: c.projectId,
        integrationId: c.integrationId,
        config: { ...c.config },
        secrets: c.secrets,
      }
    },
    async insertCheckResults(userId, projectId, connectionId, input: NewCheckResult[]) {
      if (!connection(userId, projectId, connectionId)) return false
      for (const r of input) {
        results.push({
          userId,
          projectId,
          connectionId,
          checkId: r.checkId,
          status: r.status,
          message: r.message,
          details: r.details === null ? null : structuredClone(r.details),
          checkedAt: new Date(r.checkedAt).toISOString(),
        })
      }
      return true
    },
    async latestCheckResults(userId, projectId) {
      if (!project(userId, projectId)) return null
      const latest = new Map<string, StoredResult>()
      for (const r of results) {
        if (r.userId !== userId || r.projectId !== projectId) continue
        const key = JSON.stringify([r.connectionId, r.checkId])
        const prev = latest.get(key)
        // Later insertion wins ties (mirrors `checked_at desc, id desc`).
        if (!prev || Date.parse(r.checkedAt) >= Date.parse(prev.checkedAt)) latest.set(key, r)
      }
      return [...latest.values()]
        .map(publicResult)
        .sort(
          (a, b) =>
            (a.connectionId < b.connectionId ? -1 : a.connectionId > b.connectionId ? 1 : 0) ||
            (a.checkId < b.checkId ? -1 : a.checkId > b.checkId ? 1 : 0),
        )
    },

    async claimDueConnections(limit, intervalSeconds, perUser) {
      assertIntInRange('limit', limit, 1, 100)
      assertIntInRange('intervalSeconds', intervalSeconds, 60, 86400)
      assertIntInRange('perUser', perUser, 1, 100)
      const t = schedulerNow()
      const taken = new Map<string, number>()
      const due = [...connections.values()]
        .filter((c) => c.nextCheckAt <= t)
        .sort((a, b) => a.nextCheckAt - b.nextCheckAt || a.seq - b.seq)
        .filter((c) => {
          const n = (taken.get(c.userId) ?? 0) + 1
          taken.set(c.userId, n)
          return n <= perUser
        })
        .slice(0, limit)
      for (const c of due) c.nextCheckAt = t + intervalSeconds * 1000
      return due.map((c) => ({ userId: c.userId, projectId: c.projectId, connectionId: c.id }))
    },
    async pruneCheckResults(olderThanDays) {
      assertIntInRange('olderThanDays', olderThanDays, 1, 3650)
      const cutoff = schedulerNow() - olderThanDays * 86_400_000
      const before = results.length
      dropResults((r) => Date.parse(r.checkedAt) < cutoff)
      return before - results.length
    },

    async getPath(userId, projectId) {
      const p = project(userId, projectId)
      if (!p) return null
      return {
        nodes: p.path.nodes.map((n) => ({ ...n })).sort(byId),
        edges: p.path.edges.map((e) => ({ ...e })).sort(byId),
      }
    },
    async replacePath(userId, projectId, path) {
      const p = project(userId, projectId)
      if (!p) return false
      path.nodes.forEach((node, i) => {
        if (node.connectionId === null) return
        const c = connection(userId, projectId, node.connectionId)
        if (!c) throw new ValidationError(`nodes.${i}.connectionId`, 'Connexion introuvable.')
        if (c.integrationId !== node.integrationId) {
          throw new ValidationError(
            `nodes.${i}.connectionId`,
            "La connexion ne correspond pas à l'intégration du nœud.",
          )
        }
      })
      p.path = {
        nodes: path.nodes.map((n) => ({ ...n })),
        edges: path.edges.map((e) => ({ ...e })),
      }
      return true
    },
  }
}
