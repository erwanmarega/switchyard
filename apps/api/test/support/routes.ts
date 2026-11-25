import { randomUUID } from 'node:crypto'
import { defineIntegration } from '@switchyard/plugin-sdk'
import { createLocalJWKSet } from 'jose'
import { buildApp } from '../../src/app.js'
import { createTokenVerifier } from '../../src/auth/jwt.js'
import { createSecretBox, type SecretBox } from '../../src/crypto/secrets.js'
import { IntegrationRegistry, createDefaultRegistry } from '../../src/integrations/registry.js'
import { fakeDb, signToken, testConfig, type Signer } from '../helpers.js'
import { createMemoryStore, type MemoryStore } from './memory-store.js'

export const fakeIntegration = defineIntegration({
  id: 'fake',
  name: 'Fake',
  credentialsSchema: [
    { key: 'token', label: 'Token', secret: true },
    { key: 'teamId', label: 'Team', secret: false },
  ],
  checks: [],
})

export const otherIntegration = defineIntegration({
  id: 'other',
  name: 'Other',
  credentialsSchema: [{ key: 'apiKey', label: 'Key', secret: true }],
  checks: [],
})

export const patternIntegration = defineIntegration({
  id: 'pattern',
  name: 'Pattern',
  credentialsSchema: [
    { key: 'token', label: 'Token', secret: true },
    { key: 'slug', label: 'Slug', secret: false, optional: true, pattern: '[a-z0-9-]+' },
  ],
  checks: [],
})

export function routesApp(signer: Signer) {
  const config = testConfig()
  const registry = createDefaultRegistry()
  registry.register(fakeIntegration)
  registry.register(otherIntegration)
  registry.register(patternIntegration)
  const store: MemoryStore = createMemoryStore()
  const box: SecretBox = createSecretBox(config.SWITCHYARD_ENCRYPTION_KEY)
  const verifyToken = createTokenVerifier(
    config.SUPABASE_URL,
    createLocalJWKSet({ keys: [signer.jwk] }),
  )
  const app = buildApp({ config, db: fakeDb(), verifyToken, store, registry })
  return { app, store, box, registry: registry satisfies IntegrationRegistry }
}

export async function bearer(signer: Signer, sub: string) {
  return { authorization: `Bearer ${await signToken(signer, { sub })}` }
}

export const uid = () => randomUUID()
