<script setup>
import NavBar from './NavBar.vue'

const marks = ['Vercel', 'Stripe', 'Cloudflare', 'Supabase', 'AWS', 'Resend']
</script>

<template>
  <section id="top" class="hero">
    <img
      class="bg"
      :src="'/img/hero.webp'"
      alt=""
      aria-hidden="true"
      width="2400"
      height="1400"
      fetchpriority="high"
      decoding="async"
    />
    <div class="shade" aria-hidden="true"></div>

    <NavBar />

    <div class="copy">
      <h1>Suivez tout le chemin de votre projet.</h1>
      <p class="sub">
        De votre nom de domaine jusqu'à vos paiements : repérez ce qui bloque avant vos
        utilisateurs.
      </p>
      <div class="ctas">
        <a class="btn btn-light" href="#">Suivre le projet sur GitHub</a>
        <NuxtLink class="btn btn-dark" to="/#solution">Voir la démo du chemin</NuxtLink>
      </div>
    </div>

    <div class="strip">
      <div class="cell">
        <span class="pill"><span class="dot" aria-hidden="true"></span>Bientôt</span>
        <span>Gare de triage pour votre stack</span>
      </div>
      <div class="cell"><span>Open source · auto-hébergeable</span></div>
      <div class="cell marks">
        <span class="lbl">Intégrations prévues</span>
        <ul aria-label="Intégrations prévues">
          <li v-for="m in marks" :key="m">{{ m }}</li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  min-height: min(100svh, 860px);
  display: flex;
  flex-direction: column;
  background-color: var(--prussian);
  color: var(--paper);
  overflow: hidden;
}
.bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: right center;
}
.shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    rgba(27, 58, 140, 0.78) 0%,
    rgba(27, 58, 140, 0.35) 45%,
    rgba(27, 58, 140, 0) 70%
  );
}
.strip {
  position: relative;
  display: flex;
  font-size: 13px;
  border-top: 1px solid var(--line-light);
  background: rgba(27, 58, 140, 0.55);
}
.cell {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 32px;
  white-space: nowrap;
  border-right: 1px solid var(--line-light);
}
.cell:last-child {
  border-right: 0;
  flex: 1;
  min-width: 0;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  background: var(--paper);
  color: var(--navy-ink);
  padding: 3px 8px;
}
.dot {
  width: 6px;
  height: 6px;
  background: var(--signal);
  display: inline-block;
}
.marks {
  gap: 24px;
  overflow-x: auto;
  scrollbar-width: none;
}
.marks::-webkit-scrollbar {
  display: none;
}
.lbl {
  font-family: var(--font-mono);
  font-size: 11px;
  opacity: 0.8;
  text-transform: uppercase;
}
.marks ul {
  display: flex;
  gap: 28px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.marks li {
  font-weight: 700;
  font-size: 15px;
  opacity: 0.75;
}
.copy {
  position: relative;
  margin-top: auto;
  padding: 64px 32px 56px;
  max-width: 760px;
}
h1 {
  color: var(--paper);
  font-size: clamp(48px, 7vw, 104px);
  margin-bottom: 24px;
  text-wrap: balance;
}
.sub {
  max-width: 44ch;
  font-size: 18px;
  margin-bottom: 32px;
  opacity: 0.95;
}
.ctas {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
@media (max-width: 820px) {
  .hero {
    min-height: 720px;
  }
  .shade {
    background: linear-gradient(0deg, rgba(27, 58, 140, 0.85) 0%, rgba(27, 58, 140, 0.3) 70%);
  }
  .strip {
    flex-direction: column;
  }
  .cell {
    padding: 10px 20px;
    border-right: 0;
    border-bottom: 1px solid var(--line-light);
    white-space: normal;
  }
  .cell:last-child {
    border-bottom: 0;
  }
  .marks {
    flex-wrap: nowrap;
  }
  .copy {
    padding: 48px 20px 40px;
  }
}
</style>
