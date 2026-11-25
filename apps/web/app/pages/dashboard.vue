<script setup lang="ts">
import { computed, ref } from 'vue'
import { definePageMeta, useFetch, useHead } from '#imports'
import { useAuth } from '~/composables/useAuth'
import { validatePath } from '@switchyard/plugin-sdk'
import { demoDiagnostics, demoPath, demoProject, demoStatuses } from '~/utils/demo-path'
import type { IntegrationSummary } from '~/components/dashboard/IntegrationsGrid.vue'

useHead({ title: 'Tableau de bord — Switchyard' })
definePageMeta({ middleware: 'auth' })

const project = demoProject
const pathErrors = validatePath(demoPath)

// Selected station: the probable cause of the incident, if any, is open by default.
const selectedId = ref<string | null>(project.incident?.causeNodeId ?? null)
const selectedNode = computed(() => demoPath.nodes.find((n) => n.id === selectedId.value) ?? null)

// Same-origin request through the /api proxy: the session cookie is forwarded.
// An expired session (401) clears the cached user and sends the visitor back to /connexion.
const { handleUnauthorized } = useAuth()
const { data, error, status } = await useFetch<{ integrations: IntegrationSummary[] }>(
  '/api/integrations',
  { onResponseError: ({ response }) => void handleUnauthorized({ status: response.status }) },
)
</script>

<template>
  <div class="page">
    <DashboardBar :project="project.name" />
    <main>
      <DashboardProjectHead
        :project="project"
        :statuses="demoStatuses"
        :diagnostics="demoDiagnostics"
        :path="demoPath"
      />
      <DashboardIncidentBanner v-if="project.incident" :incident="project.incident" />
      <DashboardEmptyState v-if="demoPath.nodes.length === 0" />
      <div v-else class="columns">
        <div class="main">
          <DashboardPathGraph
            :path="demoPath"
            :statuses="demoStatuses"
            :diagnostics="demoDiagnostics"
            :errors="pathErrors"
            :incident="project.incident"
            :selected-id="selectedId"
            @select="selectedId = $event"
          />
        </div>
        <div class="side">
          <DashboardStationPanel
            v-if="selectedNode"
            :node="selectedNode"
            :status="demoStatuses[selectedNode.id] ?? 'unknown'"
            :diagnostic="demoDiagnostics[selectedNode.id]"
            :incident="project.incident"
            @close="selectedId = null"
          />
          <DashboardOverviewPanel v-else :project="project" :path="demoPath" />
        </div>
      </div>
      <section id="integrations" class="integrations">
        <DashboardIntegrationsGrid
          :integrations="data?.integrations"
          :loading="status === 'pending'"
          :failed="!!error"
        />
      </section>
    </main>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  background: #fff;
  color: var(--dash-ink);
}
.columns {
  display: flex;
  flex-wrap: wrap;
  border-top: 1px solid var(--dash-line);
}
.main {
  flex: 999 1 640px;
  min-width: 0;
  padding: 24px 32px;
  background: #fff;
}
.side {
  flex: 1 1 360px;
  max-width: 100%;
  padding: 24px;
  background: var(--dash-panel);
  border-left: 1px solid var(--dash-line);
}
.integrations {
  border-top: 1px solid var(--dash-line);
  background: #fff;
}
@media (max-width: 820px) {
  .main {
    padding: 20px;
  }
  .side {
    border-left: 0;
    border-top: 1px solid var(--dash-line);
  }
}
</style>
