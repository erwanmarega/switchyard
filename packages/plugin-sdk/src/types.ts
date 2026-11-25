export type CheckStatus = 'ok' | 'warning' | 'error' | 'unknown'

export interface CheckResult {
  checkId: string
  status: CheckStatus
  message: string
  details?: Record<string, unknown>
  /** ISO 8601 timestamp. */
  checkedAt: string
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

export interface IntegrationContext {
  credentials: Readonly<Record<string, string>>
  fetch: typeof fetch
  logger: Logger
  signal?: AbortSignal
}

export interface Check {
  id: string
  title: string
  run(ctx: IntegrationContext): Promise<CheckResult>
}

export interface CredentialField {
  key: string
  label: string
  /** Secret fields must never be logged or returned by the API. */
  secret: boolean
}

export interface Integration {
  id: string
  name: string
  credentialsSchema: CredentialField[]
  checks: Check[]
}

export interface PathNode {
  id: string
  integrationId: string
  label: string
  /** Connection (credentials) bound to this node, if any. */
  connectionId?: string | null
}

export interface PathEdge {
  id: string
  from: string
  to: string
  label?: string
}

export interface ProjectPath {
  nodes: PathNode[]
  edges: PathEdge[]
}
