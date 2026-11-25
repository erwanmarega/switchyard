import type { Sql, TransactionSql } from 'postgres'
import {
  LIMITS,
  LimitError,
  ValidationError,
  type ConnectionRecord,
  type PathEdgeRecord,
  type PathNodeRecord,
  type PathRecord,
  type ProjectRecord,
  type Store,
} from './types.js'

interface ProjectRow {
  id: string
  name: string
  created_at: Date
  updated_at: Date
}

interface ConnectionRow {
  id: string
  project_id: string
  integration_id: string
  label: string
  config: Record<string, string>
  has_secrets: boolean
  created_at: Date
  updated_at: Date
}

const toProject = (r: ProjectRow): ProjectRecord => ({
  id: r.id,
  name: r.name,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
})

const toConnection = (r: ConnectionRow): ConnectionRecord => ({
  id: r.id,
  projectId: r.project_id,
  integrationId: r.integration_id,
  label: r.label,
  config: r.config,
  hasSecrets: r.has_secrets,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
})

export function createPostgresStore(sql: Sql): Store {
  /**
   * The single entry point for data access: one transaction that drops to the least-privilege
   * role and binds the user id for RLS before any query runs.
   */
  function withUser<T>(userId: string, fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
    return sql.begin(async (tx) => {
      await tx`set local role switchyard_api`
      await tx`select set_config('switchyard.user_id', ${userId}, true)`
      return fn(tx)
    }) as Promise<T>
  }

  /** Locks the project row (serializes quota checks / path replacement). */
  async function lockProject(tx: TransactionSql, userId: string, projectId: string) {
    const rows = await tx`
      select id from switchyard.projects
      where id = ${projectId} and user_id = ${userId}
      for update`
    return rows.length > 0
  }

  async function projectExists(tx: TransactionSql, userId: string, projectId: string) {
    const rows = await tx`
      select id from switchyard.projects where id = ${projectId} and user_id = ${userId}`
    return rows.length > 0
  }

  const selectConnection = (tx: TransactionSql, userId: string, projectId: string, id: string) =>
    tx<ConnectionRow[]>`
      select id, project_id, integration_id, label, config,
        (secrets is not null) as has_secrets, created_at, updated_at
      from switchyard.connections
      where id = ${id} and project_id = ${projectId} and user_id = ${userId}`

  return {
    listProjects: (userId) =>
      withUser(userId, async (tx) => {
        const rows = await tx<ProjectRow[]>`
          select id, name, created_at, updated_at from switchyard.projects
          where user_id = ${userId}
          order by created_at, id`
        return rows.map(toProject)
      }),

    getProject: (userId, projectId) =>
      withUser(userId, async (tx) => {
        const rows = await tx<ProjectRow[]>`
          select id, name, created_at, updated_at from switchyard.projects
          where id = ${projectId} and user_id = ${userId}`
        return rows[0] ? toProject(rows[0]) : null
      }),

    createProject: (userId, name) =>
      withUser(userId, async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtextextended(${`projects:${userId}`}, 0))`
        const [count] = await tx<{ n: number }[]>`
          select count(*)::int as n from switchyard.projects where user_id = ${userId}`
        if (count!.n >= LIMITS.projectsPerUser) {
          throw new LimitError(`Limite de ${LIMITS.projectsPerUser} projets atteinte.`)
        }
        const rows = await tx<ProjectRow[]>`
          insert into switchyard.projects (user_id, name) values (${userId}, ${name})
          returning id, name, created_at, updated_at`
        return toProject(rows[0]!)
      }),

    updateProject: (userId, projectId, name) =>
      withUser(userId, async (tx) => {
        const rows = await tx<ProjectRow[]>`
          update switchyard.projects set name = ${name}
          where id = ${projectId} and user_id = ${userId}
          returning id, name, created_at, updated_at`
        return rows[0] ? toProject(rows[0]) : null
      }),

    deleteProject: (userId, projectId) =>
      withUser(userId, async (tx) => {
        const rows = await tx`
          delete from switchyard.projects
          where id = ${projectId} and user_id = ${userId}
          returning id`
        return rows.length > 0
      }),

    listConnections: (userId, projectId) =>
      withUser(userId, async (tx) => {
        if (!(await projectExists(tx, userId, projectId))) return null
        const rows = await tx<ConnectionRow[]>`
          select id, project_id, integration_id, label, config,
            (secrets is not null) as has_secrets, created_at, updated_at
          from switchyard.connections
          where project_id = ${projectId} and user_id = ${userId}
          order by created_at, id`
        return rows.map(toConnection)
      }),

    getConnection: (userId, projectId, connectionId) =>
      withUser(userId, async (tx) => {
        const rows = await selectConnection(tx, userId, projectId, connectionId)
        return rows[0] ? toConnection(rows[0]) : null
      }),

    createConnection: (userId, projectId, input) =>
      withUser(userId, async (tx) => {
        if (!(await lockProject(tx, userId, projectId))) return null
        const [count] = await tx<{ n: number }[]>`
          select count(*)::int as n from switchyard.connections
          where project_id = ${projectId} and user_id = ${userId}`
        if (count!.n >= LIMITS.connectionsPerProject) {
          throw new LimitError(`Limite de ${LIMITS.connectionsPerProject} connexions atteinte.`)
        }
        const rows = await tx<ConnectionRow[]>`
          insert into switchyard.connections
            (id, user_id, project_id, integration_id, label, config, secrets)
          values (${input.id}, ${userId}, ${projectId}, ${input.integrationId}, ${input.label},
            ${tx.json(input.config)}, ${input.secrets})
          returning id, project_id, integration_id, label, config,
            (secrets is not null) as has_secrets, created_at, updated_at`
        return toConnection(rows[0]!)
      }),

    updateConnection: (userId, projectId, connectionId, patch) =>
      withUser(userId, async (tx) => {
        if ((await selectConnection(tx, userId, projectId, connectionId)).length === 0) return null
        if (patch.label !== undefined) {
          await tx`
            update switchyard.connections set label = ${patch.label}
            where id = ${connectionId} and project_id = ${projectId} and user_id = ${userId}`
        }
        if (patch.credentials) {
          await tx`
            update switchyard.connections
            set config = ${tx.json(patch.credentials.config)}, secrets = ${patch.credentials.secrets}
            where id = ${connectionId} and project_id = ${projectId} and user_id = ${userId}`
        }
        const rows = await selectConnection(tx, userId, projectId, connectionId)
        return rows[0] ? toConnection(rows[0]) : null
      }),

    deleteConnection: (userId, projectId, connectionId) =>
      withUser(userId, async (tx) => {
        // Serializes with replacePath, which checks connections before inserting nodes.
        if (!(await lockProject(tx, userId, projectId))) return false
        const rows = await tx`
          delete from switchyard.connections
          where id = ${connectionId} and project_id = ${projectId} and user_id = ${userId}
          returning id`
        return rows.length > 0
      }),

    getConnectionSecrets: (userId, projectId, connectionId) =>
      withUser(userId, async (tx) => {
        const rows = await tx<{ secrets: string | null }[]>`
          select secrets from switchyard.connections
          where id = ${connectionId} and project_id = ${projectId} and user_id = ${userId}`
        return rows[0]?.secrets ?? null
      }),

    getPath: (userId, projectId) =>
      withUser(userId, async (tx) => {
        if (!(await projectExists(tx, userId, projectId))) return null
        const nodes = await tx<
          { id: string; integration_id: string; label: string; connection_id: string | null }[]
        >`
          select id, integration_id, label, connection_id from switchyard.path_nodes
          where project_id = ${projectId} and user_id = ${userId}
          order by id`
        const edges = await tx<
          { id: string; from_node: string; to_node: string; label: string | null }[]
        >`
          select id, from_node, to_node, label from switchyard.path_edges
          where project_id = ${projectId} and user_id = ${userId}
          order by id`
        return {
          nodes: nodes.map((n): PathNodeRecord => ({
            id: n.id,
            integrationId: n.integration_id,
            label: n.label,
            connectionId: n.connection_id,
          })),
          edges: edges.map((e): PathEdgeRecord => {
            const edge: PathEdgeRecord = { id: e.id, from: e.from_node, to: e.to_node }
            if (e.label !== null) edge.label = e.label
            return edge
          }),
        } satisfies PathRecord
      }),

    replacePath: (userId, projectId, path) =>
      withUser(userId, async (tx) => {
        if (!(await lockProject(tx, userId, projectId))) return false

        const connections = await tx<{ id: string; integration_id: string }[]>`
          select id, integration_id from switchyard.connections
          where project_id = ${projectId} and user_id = ${userId}`
        const byId = new Map(connections.map((c) => [c.id, c.integration_id]))
        path.nodes.forEach((node, i) => {
          if (node.connectionId === null) return
          const integrationId = byId.get(node.connectionId)
          if (integrationId === undefined) {
            throw new ValidationError(`nodes.${i}.connectionId`, 'Connexion introuvable.')
          }
          if (integrationId !== node.integrationId) {
            throw new ValidationError(
              `nodes.${i}.connectionId`,
              "La connexion ne correspond pas à l'intégration du nœud.",
            )
          }
        })

        await tx`
          delete from switchyard.path_edges
          where project_id = ${projectId} and user_id = ${userId}`
        await tx`
          delete from switchyard.path_nodes
          where project_id = ${projectId} and user_id = ${userId}`
        if (path.nodes.length > 0) {
          const rows = path.nodes.map((n) => ({
            project_id: projectId,
            id: n.id,
            user_id: userId,
            connection_id: n.connectionId,
            integration_id: n.integrationId,
            label: n.label,
          }))
          await tx`insert into switchyard.path_nodes ${tx(rows)}`
        }
        if (path.edges.length > 0) {
          const rows = path.edges.map((e) => ({
            project_id: projectId,
            id: e.id,
            user_id: userId,
            from_node: e.from,
            to_node: e.to,
            label: e.label ?? null,
          }))
          await tx`insert into switchyard.path_edges ${tx(rows)}`
        }
        return true
      }),
  }
}
