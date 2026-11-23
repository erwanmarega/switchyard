<script setup>
import SectionHeader from './SectionHeader.vue'
import StackPath from './StackPath.vue'
</script>

<template>
  <section id="solution" class="pad" aria-labelledby="solution-title">
    <SectionHeader id="solution-title" title="Un seul chemin, de bout en bout.">
      Switchyard connecte vos outils en lecture seule et les relie sous la forme d'un chemin : un
      graphe qui représente le parcours réel d'une requête ou d'un paiement. Quand un maillon casse,
      il vous montre où et pourquoi.
    </SectionHeader>

    <div class="panel">
      <img
        class="bg"
        :src="'/img/solution-bg.webp'"
        alt=""
        aria-hidden="true"
        width="2000"
        height="1100"
        loading="lazy"
        decoding="async"
      />
      <div class="inner"><StackPath /></div>
    </div>
    <p class="note mono-label">Maquette interactive</p>
  </section>
</template>

<style scoped>
.panel {
  position: relative;
  background-color: var(--prussian);
  padding: 48px;
  overflow: hidden;
}
.bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.inner {
  position: relative;
}
.note {
  margin-top: 12px;
  opacity: 0.6;
  font-size: 11px;
}
@media (max-width: 820px) {
  .panel {
    padding: 16px;
  }
}
</style>
