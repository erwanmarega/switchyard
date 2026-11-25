import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const KEY_BYTES = 32
const IV_BYTES = 12
const TAG_BYTES = 16
const VERSION = 'v1'
const ALGORITHM = 'aes-256-gcm'
const STRICT_BASE64 = /^[A-Za-z0-9+/]{43}=$/

export interface SecretBox {
  /** Encrypts `plaintext`, binding it to `aad` (e.g. `connection:<id>:user:<id>`). */
  seal(plaintext: string, aad: string): string
  /** Decrypts a value produced by `seal` with the same key and `aad`. Throws a generic error. */
  open(sealed: string, aad: string): string
}

/** Parses a standard base64 (padded) string that decodes to exactly 32 bytes. Never echoes it. */
export function parseEncryptionKey(value: string): Buffer {
  const key = STRICT_BASE64.test(value) ? Buffer.from(value, 'base64') : null
  if (key?.length !== KEY_BYTES) {
    throw new Error('Encryption key must be 32 random bytes encoded as standard base64')
  }
  return key
}

function fail(): never {
  throw new Error('Unable to decrypt secret')
}

const b64url = (buf: Buffer) => buf.toString('base64url')
const BASE64URL = /^[A-Za-z0-9_-]+$/

function decodePart(part: string, length?: number): Buffer {
  if (!BASE64URL.test(part)) fail()
  const buf = Buffer.from(part, 'base64url')
  if (length !== undefined && buf.length !== length) fail()
  return buf
}

export function createSecretBox(key: Buffer): SecretBox {
  if (key.length !== KEY_BYTES) throw new Error('Encryption key must be 32 bytes')
  const secret = Buffer.from(key)
  return {
    seal(plaintext, aad) {
      const iv = randomBytes(IV_BYTES)
      const cipher = createCipheriv(ALGORITHM, secret, iv, { authTagLength: TAG_BYTES })
      cipher.setAAD(Buffer.from(aad, 'utf8'))
      const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
      return [VERSION, b64url(iv), b64url(cipher.getAuthTag()), b64url(data)].join('.')
    },
    open(sealed, aad) {
      try {
        const parts = typeof sealed === 'string' ? sealed.split('.') : []
        if (parts.length !== 4 || parts[0] !== VERSION) fail()
        const iv = decodePart(parts[1]!, IV_BYTES)
        const tag = decodePart(parts[2]!, TAG_BYTES)
        const data = parts[3] === '' ? Buffer.alloc(0) : decodePart(parts[3]!)
        const decipher = createDecipheriv(ALGORITHM, secret, iv, { authTagLength: TAG_BYTES })
        decipher.setAAD(Buffer.from(aad, 'utf8'))
        decipher.setAuthTag(tag)
        return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
      } catch {
        return fail()
      }
    },
  }
}

export function sealJson(box: SecretBox, value: Record<string, string>, aad: string): string {
  return box.seal(JSON.stringify(value), aad)
}

export function openJson(box: SecretBox, sealed: string, aad: string): Record<string, string> {
  const plaintext = box.open(sealed, aad)
  let value: unknown
  try {
    value = JSON.parse(plaintext)
  } catch {
    return fail()
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !Object.values(value).every((v) => typeof v === 'string')
  ) {
    return fail()
  }
  return value as Record<string, string>
}
