<script setup lang="ts">
import { definePageMeta, useFetch, useHead } from '#imports'
import { useAuth } from '~/composables/useAuth'
import { validatePath } from '@switchyard/plugin-sdk'
import { VueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { demoPath, demoStatuses } from '~/utils/demo-path'
import { STATUS_COLORS, STATUS_LABELS, toFlowElements } from '~/utils/to-flow'
import type { CheckStatus } from '@switchyard/plugin-sdk'

useHead({ title: 'Tableau de bord — Switchyard' })
definePageMeta({ middleware: 'auth' })

const pathErrors = validatePath(demoPath)
const { nodes, edges } = toFlowElements(demoPath, demoStatuses)
const legend = Object.keys(STATUS_COLORS) as CheckStatus[]

interface IntegrationSummary {
  id: string
  name: string
  checks: string[]
}

// Same-origin request through the /api proxy: the session cookie is forwarded.
// An expired session (401) clears the cached user and sends the visitor back to /connexion.
const { handleUnauthorized } = useAuth()
const { data, error, status } = await useFetch<{ integrations: IntegrationSummary[] }>(
  '/api/integrations',
  { onResponseError: ({ response }) => void handleUnauthorized({ status: response.status }) },
)
</script>

<template>
  <div>
    <DashboardBar />
    <main class="page">
      <h1>Chemin du projet</h1>
      <p class="lead">
        Le parcours d'une requête et d'un paiement, de votre domaine à vos données.
      </p>

      <section class="card">
        <h2>Graphe</h2>
        <p v-if="pathErrors.length" class="error-box">
          Chemin invalide : {{ pathErrors.join(' ; ') }}
        </p>
        <template v-else>
          <ul class="legend">
            <li v-for="s in legend" :key="s">
              <span class="dot" :style="{ background: STATUS_COLORS[s] }" />{{ STATUS_LABELS[s] }}
            </li>
          </ul>
          <ClientOnly>
            <div class="flow-wrapper">
              <VueFlow
                :nodes="nodes"
                :edges="edges"
                :nodes-draggable="false"
                :nodes-connectable="false"
                fit-view-on-init
              >
                <Background />
                <Controls :show-interactive="false" />
              </VueFlow>
            </div>
            <template #fallback>
              <div class="flow-wrapper" />
            </template>
          </ClientOnly>
        </template>
      </section>

      <section class="card">
        <h2>Intégrations disponibles</h2>
        <p v-if="status === 'pending'">Chargement…</p>
        <p v-else-if="error" class="error-box">
          Impossible de récupérer les intégrations. Vérifiez que l'API est démarrée et que votre
          session est active.
        </p>
        <ul v-else-if="data?.integrations.length">
          <li v-for="i in data.integrations" :key="i.id">
            <strong>{{ i.name }}</strong> — {{ i.checks.length }} vérification(s)
          </li>
        </ul>
        <p v-else>Aucune intégration enregistrée.</p>
      </section>
    </main>
  </div>
</template>
