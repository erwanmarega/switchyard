#!/usr/bin/env node
// Copies the local Supabase stack's settings into apps/api/.env and apps/web/.env.
// Only the keys listed below are written; every other line is preserved. Files are created from
// .env.example when missing, with mode 0600. Only key NAMES are printed, never values.
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function readStatus() {
  let out
  try {
    out = execFileSync('supabase', ['status', '-o', 'env'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    console.error('Could not read the local Supabase status. Is it running? Try: npm run db:start')
    process.exit(1)
  }
  const values = {}
  for (const line of out.split('\n')) {
    const match = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim())
    if (match) values[match[1]] = match[2]
  }
  return values
}

/** Sets `KEY=value` lines in an env file's text, appending missing keys. Other lines are kept. */
export function upsertEnv(text, entries) {
  const lines = text === '' ? [] : text.replace(/\n$/, '').split('\n')
  for (const [key, value] of Object.entries(entries)) {
    const index = lines.findIndex((l) => new RegExp(`^\\s*${key}\\s*=`).test(l))
    if (index === -1) lines.push(`${key}=${value}`)
    else lines[index] = `${key}=${value}`
  }
  return `${lines.join('\n')}\n`
}

/** Returns the trimmed, unquoted value of `KEY=value` in an env file's text ('' when absent). */
export function readEnvValue(text, key) {
  for (const line of text.split('\n')) {
    const match = new RegExp(`^\\s*${key}\\s*=(.*)$`).exec(line)
    if (match)
      return match[1]
        .trim()
        .replace(/^(["'])(.*)\1$/, '$2')
        .trim()
  }
  return ''
}

/** `entries` plus a fresh encryption key, unless `text` already holds a non-empty one. */
export function withEncryptionKey(
  text,
  entries,
  generate = () => randomBytes(32).toString('base64'),
) {
  if (readEnvValue(text, 'SWITCHYARD_ENCRYPTION_KEY') !== '') return entries
  return { ...entries, SWITCHYARD_ENCRYPTION_KEY: generate() }
}

function writeEnvFile(relativePath, entries, { encryptionKey = false } = {}) {
  const path = join(root, relativePath)
  const example = `${path}.example`
  const source = existsSync(path) ? path : existsSync(example) ? example : null
  const text = source ? readFileSync(source, 'utf8') : ''
  // Never overwrite an existing key: stored tokens would become unreadable.
  if (encryptionKey) entries = withEncryptionKey(text, entries)
  // Atomic replace (temp file + rename): a crash mid-write must never lose the encryption key.
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, upsertEnv(text, entries), { mode: 0o600 })
  chmodSync(tmp, 0o600)
  renameSync(tmp, path)
  console.log(`${relativePath}: wrote ${Object.keys(entries).join(', ')}`)
}

function main() {
  const status = readStatus()
  const required = ['API_URL', 'DB_URL', 'PUBLISHABLE_KEY']
  const missing = required.filter((k) => !status[k])
  if (missing.length > 0) {
    console.error(`Missing from \`supabase status\`: ${missing.join(', ')}`)
    process.exit(1)
  }
  // The API only needs public values (it verifies tokens through the JWKS); the web app only gets
  // the publishable key, read by its server (private runtime config, never sent to the browser).
  // The secret / service-role keys are never written anywhere.
  writeEnvFile(
    'apps/api/.env',
    { DATABASE_URL: status.DB_URL, SUPABASE_URL: status.API_URL },
    { encryptionKey: true },
  )
  writeEnvFile('apps/web/.env', {
    SUPABASE_URL: status.API_URL,
    SUPABASE_KEY: status.PUBLISHABLE_KEY,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
