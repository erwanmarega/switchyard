import {
  LIMITS,
  LimitError,
  ValidationError,
  type ConnectionRecord,
  type PathRecord,
  type ProjectRecord,
  type Store,
} from '../../src/store/types.js'

export interface MemoryStore extends Store {
  /** Test-only: the raw sealed secrets stored for a connection (null if none / unknown). */
  rawSecrets(connectionId: string): string | null
}

interface StoredConnection extends ConnectionRecord {
  userId: string
  secrets: string | null
  seq: number
}

interface StoredProject extends ProjectRecord {
  userId: string
  seq: number
  path: PathRecord
}

const byCreation = (a: { seq: number }, b: { seq: number }) => a.seq - b.seq
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** In-memory Store with the same semantics as the Postgres one (isolation, cascades, limits). */
export function createMemoryStore(): MemoryStore {
  const projects = new Map<string, StoredProject>()
  const connections = new Map<string, StoredConnection>()
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
      }
      c.updatedAt = now()
      return publicConnection(c)
    },
    async deleteConnection(userId, projectId, connectionId) {
      if (!connection(userId, projectId, connectionId)) return false
      connections.delete(connectionId)
      for (const node of projects.get(projectId)?.path.nodes ?? []) {
        if (node.connectionId === connectionId) node.connectionId = null
      }
      return true
    },
    async getConnectionSecrets(userId, projectId, connectionId) {
      return connection(userId, projectId, connectionId)?.secrets ?? null
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
