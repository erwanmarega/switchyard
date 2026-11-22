<script setup>
import SectionHeader from './SectionHeader.vue'

const first = [
  { name: 'Vercel', checks: ['Statut des déploiements', 'Variables d\'environnement manquantes entre environnements'] },
  { name: 'Stripe', checks: ['Webhooks en échec', 'Endpoints désactivés'] },
  { name: 'Cloudflare', checks: ['Enregistrements DNS', 'Expiration des certificats'] },
]
const next = ['AWS', 'Supabase', 'Railway', 'Netlify', 'GitHub Actions', 'Resend', 'Registrars de domaines']
</script>

<template>
  <section id="integrations" class="pad" aria-labelledby="integrations-title">
    <SectionHeader id="integrations-title" title="Trois aiguillages pour commencer.">
      Première version : les outils au cœur de la plupart des SaaS, connectés en lecture seule.
    </SectionHeader>
    <ul class="cols">
      <li v-for="i in first" :key="i.name" class="col">
        <h3>{{ i.name }}</h3>
        <p class="mono-label">Vérifications envisagées</p>
        <ul>
          <li v-for="c in i.checks" :key="c"><span class="chk" aria-hidden="true">✓</span>{{ c }}</li>
        </ul>
      </li>
    </ul>
    <div class="next">
      <p class="mono-label">Ensuite, selon les besoins et les contributions</p>
      <ul>
        <li v-for="n in next" :key="n">{{ n }}</li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.cols {
  list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr);
  border: 1px solid var(--line);
}
.col { padding: 24px; border-right: 1px solid var(--line); }
.col:last-child { border-right: 0; }
.col h3 { font-size: 34px; margin-bottom: 18px; }
.col .mono-label { margin-bottom: 8px; opacity: 0.7; }
.col ul { list-style: none; margin: 0; padding: 0; }
.col ul li { display: flex; gap: 10px; padding: 10px 0; border-top: 1px solid var(--line); font-size: 15px; }
.chk { font-family: var(--font-mono); color: var(--prussian); }
.next { margin-top: 32px; display: flex; gap: 24px; align-items: baseline; flex-wrap: wrap; }
.next .mono-label { opacity: 0.7; }
.next ul { display: flex; flex-wrap: wrap; gap: 8px; list-style: none; margin: 0; padding: 0; }
.next li { border: 1px solid var(--line); padding: 6px 10px; font-size: 14px; }
@media (max-width: 820px) {
  .cols { grid-template-columns: 1fr; }
  .col { border-right: 0; border-bottom: 1px solid var(--line); }
  .col:last-child { border-bottom: 0; }
}
</style>
