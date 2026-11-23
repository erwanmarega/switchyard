import type { Integration } from '@switchyard/plugin-sdk'
import { exampleIntegration } from './example.js'

export class IntegrationRegistry {
  private readonly integrations = new Map<string, Readonly<Integration>>()

  register(integration: Readonly<Integration>): void {
    if (this.integrations.has(integration.id)) {
      throw new Error(`Integration "${integration.id}" is already registered`)
    }
    this.integrations.set(integration.id, integration)
  }

  list(): Readonly<Integration>[] {
    return [...this.integrations.values()]
  }
}

export function createDefaultRegistry(): IntegrationRegistry {
  const registry = new IntegrationRegistry()
  registry.register(exampleIntegration)
  return registry
}
