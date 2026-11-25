<script setup lang="ts">
export interface IntegrationSummary {
  id: string
  name: string
  checks: string[]
}

defineProps<{
  integrations: IntegrationSummary[] | undefined
  loading: boolean
  failed: boolean
}>()
</script>

<template>
  <section class="pad" aria-labelledby="integrations-title">
    <header class="head">
      <p class="mono-label">02 / Intégrations</p>
      <h2 id="integrations-title">Intégrations disponibles</h2>
    </header>

    <p v-if="loading" class="note mono-label">Chargement…</p>
    <p v-else-if="failed" class="error-box">
      Impossible de récupérer les intégrations. Vérifiez que l'API est démarrée et que votre session
      est active.
    </p>
    <ul v-else-if="integrations?.length" class="grid">
      <li v-for="i in integrations" :key="i.id" class="cell">
        <span class="mono-label">{{ i.id }}</span>
        <h3>{{ i.name }}</h3>
        <p class="count">{{ i.checks.length }} vérification(s)</p>
        <ul v-if="i.checks.length" class="checks">
          <li v-for="c in i.checks" :key="c">{{ c }}</li>
        </ul>
      </li>
    </ul>
    <p v-else class="note mono-label">Aucune intégration enregistrée.</p>
  </section>
</template>

<style scoped>
.pad {
  padding: 48px 40px;
}
.head {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 28px;
  color: var(--prussian);
}
h2 {
  font-size: clamp(28px, 3.6vw, 44px);
}
.note {
  color: var(--navy-ink);
}
.error-box {
  border: 1px solid var(--status-bad);
  background: #fdf1ef;
  color: var(--navy-ink);
  padding: 14px 16px;
}
.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-top: 1px solid var(--line);
  border-left: 1px solid var(--line);
}
.cell {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px;
  min-width: 0;
  color: var(--prussian);
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.cell h3 {
  font-size: 26px;
}
.count {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--navy-ink);
}
.checks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--navy-ink);
  overflow-wrap: anywhere;
}
.checks li::before {
  content: '— ';
  opacity: 0.5;
}
@media (max-width: 900px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 820px) {
  .pad {
    padding: 32px 20px;
  }
}
@media (max-width: 600px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
