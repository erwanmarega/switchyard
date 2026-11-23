import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { runMigrations } from './migrations.js'

export type Database = DatabaseSync

/** Opens (and migrates) the database described by a `DATABASE_URL` (`file:<path>` or `:memory:`). */
export function openDatabase(url: string): Database {
  const inMemory = url === ':memory:' || url === 'file::memory:'
  let db: DatabaseSync
  if (inMemory) {
    db = new DatabaseSync(':memory:')
  } else {
    if (!url.startsWith('file:')) {
      throw new Error('DATABASE_URL must be ":memory:" or start with "file:" (SQLite only)')
    }
    const path = resolve(url.slice('file:'.length))
    // Owner-only: the database holds password hashes and session hashes.
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    // Create the file as 0600 up front so the WAL/SHM files SQLite derives from it are private too.
    writeFileSync(path, '', { flag: 'a', mode: 0o600 })
    db = new DatabaseSync(path)
    chmodSync(path, 0o600)
    db.exec('PRAGMA journal_mode=WAL')
  }
  db.exec('PRAGMA foreign_keys=ON')
  runMigrations(db)
  return db
}
