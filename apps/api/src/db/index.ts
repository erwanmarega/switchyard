import postgres, { type Sql } from 'postgres'

/** Minimal database surface the app depends on (tests inject a fake). */
export interface Database {
  /** Resolves when the database answers `select 1`, rejects otherwise. */
  ping(): Promise<void>
  close(): Promise<void>
}

export interface PostgresDatabase extends Database {
  /** Tagged-template client. App tables live in the private `switchyard` schema. */
  sql: Sql
}

/** Creates the Postgres client. Connections are lazy: nothing is opened until the first query. */
export function openDatabase(
  url: string,
  ssl: 'require' | 'disable' = 'require',
): PostgresDatabase {
  const sql = postgres(url, {
    ssl: ssl === 'require' ? 'require' : false,
    max: 5,
    connect_timeout: 5,
    idle_timeout: 30,
    onnotice: () => {},
  })
  return {
    sql,
    async ping() {
      await sql`select 1`
    },
    async close() {
      await sql.end({ timeout: 5 })
    },
  }
}
