<script setup lang="ts">
// "Vide" screen: no tool connected yet. Every action leads to the integrations section below.
const starters = ['Domaine', 'Cloudflare', 'Vercel', 'Supabase', 'Stripe', 'Resend', 'AWS']
</script>

<template>
  <section class="empty" aria-labelledby="empty-title">
    <img
      src="/img/hero.webp"
      alt="Locomotive à vapeur en trame halftone, à l'arrêt sur une voie"
      class="hero"
    />
    <div class="copy">
      <h2 id="empty-title">Connecte ton premier outil</h2>
      <p>
        Chaque outil devient une gare sur la ligne de ton projet. Commence par le domaine ou
        l'hébergement : Switchyard trace les voies et vérifie chaque connexion.
      </p>
    </div>
    <div class="actions">
      <a href="#integrations" class="btn signal"><PixelIcon name="plus" />Ajouter un outil</a>
      <a href="#integrations" class="btn outline"
        ><PixelIcon name="book" />Lire le guide d'installation</a
      >
    </div>
    <div class="starters">
      <span class="label">OU CHOISIS UNE GARE DE DÉPART</span>
      <ul>
        <li v-for="name in starters" :key="name">
          <a href="#integrations" class="station">{{ name }}</a>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
  padding: 40px 32px 56px;
  border-top: 1px solid var(--dash-line);
  background-color: var(--paper);
  background-image: radial-gradient(circle, rgba(27, 58, 140, 0.09) 1px, transparent 1.4px);
  background-size: 7px 7px;
}
.hero {
  width: 100%;
  max-width: 720px;
  height: auto;
}
.copy {
  max-width: 640px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  text-align: center;
}
h2 {
  font-size: 44px;
  line-height: 1.05;
}
.copy p {
  font-size: 16px;
  line-height: 1.55;
  color: var(--dash-ink);
}
.actions,
.starters ul {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 0 22px;
  border: 1px solid var(--prussian);
  color: var(--prussian);
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
}
.btn.signal {
  border-color: var(--signal);
  background: var(--signal);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
}
.btn.signal:hover {
  border-color: #c0481a;
  background: #c0481a;
}
.starters {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding-top: 8px;
}
.starters ul {
  margin: 0;
  padding: 0;
  list-style: none;
  gap: 8px;
}
.label {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.12em;
  color: var(--dash-muted);
}
.station {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid var(--dash-line);
  background: var(--paper);
  color: var(--prussian);
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
}
.btn:focus-visible,
.station:focus-visible {
  outline-color: var(--prussian);
}
@media (max-width: 820px) {
  .empty {
    padding: 32px 20px 40px;
  }
  h2 {
    font-size: 32px;
  }
}
</style>
