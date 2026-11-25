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
  /**
   * Reads a response body as JSON with a streaming size cap. Throws a generic Error when the body
   * is missing, larger than `maxBytes` (declared by `content-length` or counted while reading) or
   * not valid JSON. `maxBytes` defaults to 1 MB and is clamped to a hard maximum of 10 MB. Prefer
   * it over `response.json()` / `response.text()`, which buffer an unbounded body.
   */
  readJson(response: Response, maxBytes?: number): Promise<unknown>
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
  /** When true the field may be omitted. Defaults to false (required). Not allowed on secret fields. */
  optional?: boolean
  /**
   * Regular expression source the whole value must match (it is anchored as `^(?:pattern)$`).
   * Use it for every non-secret value that ends up in a URL (ids, slugs, names).
   */
  pattern?: string
}

export type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS'

export interface Integration {
  id: string
  name: string
  credentialsSchema: CredentialField[]
  checks: Check[]
  /**
   * Hostnames `ctx.fetch` may call (exact match, https only). Required for any integration that
   * makes HTTP calls: an empty or missing list blocks every request.
   */
  allowedHosts?: string[]
  /**
   * HTTP methods `ctx.fetch` may use. Defaults to `['GET', 'HEAD']` (read-only). Only widen it for
   * read APIs that need another method (e.g. a GraphQL query over POST).
   */
  allowedMethods?: HttpMethod[]
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
