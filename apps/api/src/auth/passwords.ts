import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'

export interface ScryptParams {
  N: number
  r: number
  p: number
}

// N=2^17, r=8, p=1 needs 128 MiB (128*N*r); maxmem leaves headroom (Node's default limit is 32 MiB).
export const DEFAULT_PARAMS: ScryptParams = { N: 2 ** 17, r: 8, p: 1 }
const KEY_LEN = 64
const MAXMEM = 256 * 1024 * 1024

function derive(password: string, salt: Buffer, params: ScryptParams, len: number) {
  const options: ScryptOptions = { ...params, maxmem: MAXMEM }
  return new Promise<Buffer>((resolvePromise, reject) => {
    scrypt(password, salt, len, options, (err, key) => (err ? reject(err) : resolvePromise(key)))
  })
}

/**
 * Returns `scrypt$N$r$p$salt_b64$hash_b64`. `params` is only meant to be lowered by tests;
 * production code always uses {@link DEFAULT_PARAMS}.
 */
export async function hashPassword(
  password: string,
  params: ScryptParams = DEFAULT_PARAMS,
): Promise<string> {
  const salt = randomBytes(16)
  const hash = await derive(password, salt, params, KEY_LEN)
  return `scrypt$${params.N}$${params.r}$${params.p}$${salt.toString('base64')}$${hash.toString('base64')}`
}

function parseParams(encoded: string): ScryptParams | null {
  const parts = encoded.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null
  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  return [N, r, p].every((v) => Number.isInteger(v) && v > 0) ? { N, r, p } : null
}

/** True when a stored hash was made with parameters other than `params` (or is unreadable). */
export function needsRehash(stored: string, params: ScryptParams = DEFAULT_PARAMS): boolean {
  const current = parseParams(stored)
  return !current || current.N !== params.N || current.r !== params.r || current.p !== params.p
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const params = parseParams(encoded)
  if (!params) return false
  const [saltB64, hashB64] = encoded.split('$').slice(4) as [string, string]
  const expected = Buffer.from(hashB64, 'base64')
  if (expected.length === 0) return false
  let actual: Buffer
  try {
    actual = await derive(password, Buffer.from(saltB64, 'base64'), params, expected.length)
  } catch {
    return false
  }
  return timingSafeEqual(actual, expected)
}

/**
 * Precomputes a dummy hash once (at app start) and returns a function that burns the same CPU
 * as a real check, so unknown emails are not distinguishable by timing.
 */
export function createDummyVerifier(params: ScryptParams = DEFAULT_PARAMS) {
  const dummyHash = hashPassword(randomBytes(16).toString('hex'), params)
  // Avoid an unhandled rejection if the failure happens before the first login.
  dummyHash.catch(() => undefined)
  return async function verifyAgainstDummy(password: string): Promise<void> {
    await verifyPassword(password, await dummyHash)
  }
}
