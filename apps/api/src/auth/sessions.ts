import { createHash, randomBytes } from 'node:crypto'
import type { Database } from '../db/index.js'

export const SESSION_COOKIE = 'sy_session'
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface AuthUser {
  id: string
  email: string
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Creates a session and returns the raw token; only its SHA-256 is stored. */
export function createSession(db: Database, userId: string, now = Date.now()): string {
  const token = randomBytes(32).toString('base64url')
  db.prepare(
    'INSERT INTO sessions (id_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
  ).run(hashToken(token), userId, now + SESSION_TTL_MS, now)
  return token
}

export function findSessionUser(db: Database, token: string, now = Date.now()): AuthUser | null {
  const idHash = hashToken(token)
  const row = db
    .prepare(
      'SELECT u.id AS id, u.email AS email, s.expires_at AS expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ?',
    )
    .get(idHash) as { id: string; email: string; expires_at: number } | undefined
  if (!row) return null
  if (row.expires_at <= now) {
    db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(idHash)
    return null
  }
  return { id: row.id, email: row.email }
}

/** Removes every expired session and returns how many were deleted. */
export function deleteExpiredSessions(db: Database, now = Date.now()): number {
  const res = db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now)
  return Number(res.changes)
}

export function deleteSession(db: Database, token: string): void {
  db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(hashToken(token))
}
