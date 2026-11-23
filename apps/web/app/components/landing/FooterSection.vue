<script setup>
import { ref, onMounted } from 'vue'

const credits = ref([])

onMounted(async () => {
  try {
    const res = await fetch('/img/credits.json')
    if (!res.ok) return
    const data = await res.json()
    const list = Array.isArray(data) ? data : data.credits || data.images || Object.values(data)
    // Several outputs can share one source: keep one entry per source.
    const seen = new Set()
    credits.value = list
      .filter((c) => c && typeof c === 'object' && c.title)
      .filter((c) => {
        const key = c.source_url || c.title
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .map((c) => ({
        ...c,
        title: shorten(c.title.replace(/\.(jpe?g|png|tiff?)$/i, ''), 60),
        author: c.author
          ? shorten(c.author.split(/\s+Related names/i)[0].replace(/\s*,\s*publisher$/i, ''), 40)
          : '',
      }))
  } catch {
    // No credits available: render nothing.
  }
})

const shorten = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//.test(u) ? u : null)
</script>

<template>
  <footer class="foot">
    <div class="inner">
      <div class="top">
        <p class="word">Switchyard</p>
        <dl>
          <div>
            <dt class="mono-label">Licence</dt>
            <dd>À définir (MIT envisagée)</dd>
          </div>
          <div>
            <dt class="mono-label">Statut</dt>
            <dd>Projet en phase de conception</dd>
          </div>
        </dl>
      </div>
      <p v-if="credits.length" class="mono-label credits-label">Illustrations (domaine public)</p>
      <ul v-if="credits.length" class="credits" aria-label="Crédits des illustrations">
        <li v-for="(c, i) in credits" :key="i">
          <a
            v-if="safeUrl(c.source_url)"
            :href="safeUrl(c.source_url)"
            target="_blank"
            rel="noopener noreferrer"
            >{{ c.title }}</a
          >
          <template v-else>{{ c.title }}</template>
          <template v-if="c.author"> — {{ c.author }}</template>
        </li>
      </ul>
    </div>
  </footer>
</template>

<style scoped>
.foot {
  background: var(--navy-ink);
  color: var(--paper);
  padding: 56px 0 32px;
}
.inner {
  width: min(100% - 40px, var(--frame));
  margin-inline: auto;
}
.top {
  display: flex;
  justify-content: space-between;
  gap: 32px;
  flex-wrap: wrap;
  padding-bottom: 32px;
  border-bottom: 1px solid var(--line-light);
}
.word {
  font-family: var(--font-pixel);
  font-size: clamp(36px, 5vw, 56px);
  line-height: 1;
}
dl {
  display: flex;
  gap: 40px;
  margin: 0;
  flex-wrap: wrap;
}
dt {
  opacity: 0.6;
  margin-bottom: 4px;
}
dd {
  margin: 0;
  font-size: 15px;
}
.credits-label {
  margin: 24px 0 8px;
  opacity: 0.7;
}
.credits {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 12px;
  opacity: 0.7;
  display: grid;
  gap: 4px;
}
.credits a {
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
