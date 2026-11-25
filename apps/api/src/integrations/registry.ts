import type { Integration } from '@switchyard/plugin-sdk'
import { exampleIntegration } from './example.js'
import { vercelIntegration } from './vercel.js'

export class IntegrationRegistry {
  private readonly integrations = new Map<string, Readonly<Integration>>()

  register(integration: Readonly<Integration>): void {
    if (this.integrations.has(integration.id)) {
      throw new Error(`Integration "${integration.id}" is already registered`)
    }
    this.integrations.set(integration.id, integration)
  }

  get(id: string): Readonly<Integration> | undefined {
    return this.integrations.get(id)
  }

  list(): Readonly<Integration>[] {
    return [...this.integrations.values()]
  }
}

export function createDefaultRegistry(): IntegrationRegistry {
  const registry = new IntegrationRegistry()
  registry.register(exampleIntegration)
  registry.register(vercelIntegration)
  return registry
}
