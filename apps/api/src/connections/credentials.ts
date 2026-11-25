import type { Integration } from '@switchyard/plugin-sdk'
import { openJson, sealJson, type SecretBox } from '../crypto/secrets.js'

export interface CredentialIssue {
  path: string
  message: string
}

/** Invalid credentials. Issues name fields only, never received values. */
export class CredentialsError extends Error {
  constructor(readonly issues: CredentialIssue[]) {
    super('Invalid credentials')
    this.name = 'CredentialsError'
  }
}

export const connectionAad = (connectionId: string, userId: string) =>
  `connection:${connectionId}:user:${userId}`

export interface SplitCredentials {
  config: Record<string, string>
  /** Sealed ciphertext; null when the integration has no secret field. */
  secrets: string | null
}

/**
 * Checks that `credentials` has exactly the integration's fields, then keeps non-secret fields
 * in `config` and seals the secret ones bound to this connection and user.
 */
export function splitCredentials(
  box: SecretBox,
  integration: Readonly<Integration>,
  credentials: Readonly<Record<string, string>>,
  connectionId: string,
  userId: string,
): SplitCredentials {
  const issues: CredentialIssue[] = []
  const expected = new Set(integration.credentialsSchema.map((f) => f.key))
  for (const key of Object.keys(credentials)) {
    if (!expected.has(key)) {
      issues.push({ path: `credentials.${key.slice(0, 64)}`, message: 'Champ non autorisé.' })
    }
  }
  for (const key of expected) {
    if (!Object.hasOwn(credentials, key)) {
      issues.push({ path: `credentials.${key}`, message: 'Champ requis.' })
    }
  }
  if (issues.length > 0) throw new CredentialsError(issues)

  const config: Record<string, string> = {}
  const secretFields: Record<string, string> = {}
  for (const field of integration.credentialsSchema) {
    const value = credentials[field.key]!
    if (field.secret) secretFields[field.key] = value
    else config[field.key] = value
  }
  const secrets =
    Object.keys(secretFields).length > 0
      ? sealJson(box, secretFields, connectionAad(connectionId, userId))
      : null
  return { config, secrets }
}

/** For the future check runner: decrypts the stored secrets of a connection. */
export function openConnectionSecrets(
  box: SecretBox,
  sealed: string,
  connectionId: string,
  userId: string,
): Record<string, string> {
  return openJson(box, sealed, connectionAad(connectionId, userId))
}

export function secretFieldKeys(integration: Readonly<Integration>): string[] {
  return integration.credentialsSchema.filter((f) => f.secret).map((f) => f.key)
}
