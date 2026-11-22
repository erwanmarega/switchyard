<script setup>
import SectionHeader from './SectionHeader.vue'

const principles = [
  { title: 'Open source et auto-hébergeable', text: 'Vos tokens ne quittent jamais votre serveur.' },
  { title: 'Lecture seule', text: 'Uniquement les permissions nécessaires pour lire, jamais pour modifier votre infrastructure.' },
  { title: 'Secrets chiffrés', text: 'Vos tokens sont chiffrés au repos.' },
  { title: 'Installation simple', text: 'L\'objectif : un lancement en une commande avec Docker.' },
  { title: 'Extensible', text: 'Chaque intégration est un plugin indépendant, avec une interface commune.' },
]
</script>

<template>
  <section id="principes" class="pad" aria-labelledby="principes-title">
    <SectionHeader id="principes-title" title="Cinq règles de la voie.">
      Switchyard ne demande que ce dont il a besoin pour lire, et reste sous votre contrôle.
    </SectionHeader>
    <div class="grid">
      <ol>
        <li v-for="(p, i) in principles" :key="p.title">
          <span class="n mono-label" aria-hidden="true">{{ String(i + 1).padStart(2, '0') }}</span>
          <div>
            <h3>{{ p.title }}</h3>
            <p>{{ p.text }}</p>
          </div>
        </li>
      </ol>
      <div class="term" role="group" aria-label="Exemple de commande d'installation">
        <div class="bar"><span>terminal</span></div>
        <pre><code><span class="prompt">$</span> docker compose up -d<span class="cursor" aria-hidden="true"></span></code></pre>
        <p class="note"># objectif, pas encore disponible</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 48px; align-items: start; }
ol { list-style: none; margin: 0; padding: 0; border-bottom: 1px solid var(--line); }
li { display: flex; gap: 20px; padding: 18px 0; border-top: 1px solid var(--line); }
.n { flex: none; width: 28px; color: var(--prussian); padding-top: 4px; }
h3 { font-family: var(--font-sans); font-size: 17px; font-weight: 600; line-height: 1.3; color: var(--navy-ink); margin-bottom: 4px; }
li p { font-size: 15px; }
.term { background: var(--navy-ink); color: var(--paper); position: sticky; top: 24px; font-family: var(--font-mono); }
.bar { padding: 8px 14px; font-size: 11px; border-bottom: 1px solid var(--line-light); opacity: 0.8; }
pre { margin: 0; padding: 24px 16px 8px; overflow-x: auto; font-size: 14px; }
code { font-family: var(--font-mono); }
.prompt { color: var(--signal); margin-right: 10px; }
.cursor { display: inline-block; width: 8px; height: 1.1em; background: var(--paper); margin-left: 4px; vertical-align: text-bottom; animation: blink 1s steps(2, jump-none) infinite; }
@keyframes blink { 50% { opacity: 0; } }
.note { padding: 0 16px 20px; font-size: 12px; opacity: 0.7; }
@media (max-width: 820px) { .grid { grid-template-columns: 1fr; gap: 32px; } .term { position: static; } }
</style>
