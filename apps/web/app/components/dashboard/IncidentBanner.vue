<script setup lang="ts">
import { computed } from 'vue'
import type { ProjectIncident } from '~/utils/diagnostics'

const props = defineProps<{ incident: ProjectIncident }>()

// Message split around the highlighted substring (rendered in <strong>); no v-html.
const parts = computed(() => {
  const { message, highlight } = props.incident
  const index = highlight ? message.indexOf(highlight) : -1
  if (!highlight || index < 0) return { before: message, strong: '', after: '' }
  return {
    before: message.slice(0, index),
    strong: highlight,
    after: message.slice(index + highlight.length),
  }
})
</script>

<template>
  <section class="banner" aria-label="Incident en cours">
    <span class="chip">INCIDENT</span>
    <span class="text"
      >{{ parts.before }}<strong v-if="parts.strong">{{ parts.strong }}</strong
      >{{ parts.after }}</span
    >
  </section>
</template>

<style scoped>
.banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin: 0 32px 20px;
  padding: 12px 16px;
  border: 1px solid var(--dash-ink);
  font-size: 14px;
  line-height: 1.5;
}
.chip {
  padding: 2px 8px;
  background: var(--dash-ink);
  color: #fff;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
}
strong {
  font-weight: 600;
}
@media (max-width: 820px) {
  .banner {
    margin: 0 20px 16px;
  }
}
</style>
