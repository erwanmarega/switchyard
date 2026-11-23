<script setup>
import SectionHeader from './SectionHeader.vue'

// Each card: halftone image, product mockup (slot-free, markup below), README text.
const cards = [
  {
    id: 'deploy',
    title: 'Déploiement échoué',
    text: "Le dernier déploiement a échoué et personne ne l'a vu.",
  },
  {
    id: 'webhook',
    title: 'Webhooks Stripe en erreur',
    text: 'Les webhooks Stripe renvoient des erreurs depuis plusieurs heures.',
  },
  {
    id: 'dns',
    title: 'DNS modifié',
    text: 'Un enregistrement DNS a été modifié et ne pointe plus au bon endroit.',
  },
  {
    id: 'env',
    title: 'Variable manquante',
    text: "Une variable d'environnement existe en preview mais pas en production.",
  },
  {
    id: 'ssl',
    title: 'SSL et domaine',
    text: 'Le certificat SSL ou le nom de domaine expire dans quelques jours.',
  },
  {
    id: 'quota',
    title: 'Quota presque atteint',
    text: 'Un quota ou une limite de facturation est presque atteint.',
  },
]
</script>

<template>
  <section id="probleme" class="pad" aria-labelledby="probleme-title">
    <SectionHeader
      id="probleme-title"
      title="Les pages de statut sont au vert. Votre projet est en panne."
    >
      Ces pannes ne viennent pas du fournisseur : elles viennent de votre configuration, éparpillée
      entre une dizaine de dashboards.
    </SectionHeader>

    <ul class="grid">
      <li v-for="(c, i) in cards" :key="c.id" class="card">
        <img
          class="bg"
          :src="`/img/card-${i + 1}.webp`"
          alt=""
          aria-hidden="true"
          width="800"
          height="900"
          loading="lazy"
          decoding="async"
        />
        <div class="shade" aria-hidden="true"></div>

        <div class="ui" aria-hidden="true">
          <!-- 1. Deploys -->
          <template v-if="c.id === 'deploy'">
            <div class="ui-head">Déploiements <span class="muted">vercel</span></div>
            <div class="row bad-row">
              <span class="dot bad"></span><b>main</b><span class="muted">14h02</span
              ><span class="tag bad">Error</span>
            </div>
            <div class="row">
              <span class="dot ok"></span><b>main</b><span class="muted">11h47</span
              ><span class="tag ok">Ready</span>
            </div>
            <div class="row">
              <span class="dot ok"></span><b>fix/api</b><span class="muted">hier</span
              ><span class="tag ok">Ready</span>
            </div>
          </template>

          <!-- 2. Stripe webhooks -->
          <template v-else-if="c.id === 'webhook'">
            <div class="ui-head">
              <code>/api/stripe</code> <span class="tag bad">Taux d'échec 38 %</span>
            </div>
            <div class="row">
              <span class="dot bad"></span><span>invoice.paid</span><span class="muted">14h31</span
              ><span class="tag bad">500</span>
            </div>
            <div class="row">
              <span class="dot bad"></span><span>checkout.completed</span
              ><span class="muted">14h12</span><span class="tag bad">500</span>
            </div>
            <div class="row">
              <span class="dot ok"></span><span>customer.updated</span
              ><span class="muted">13h58</span><span class="tag ok">200</span>
            </div>
          </template>

          <!-- 3. DNS diff -->
          <template v-else-if="c.id === 'dns'">
            <div class="ui-head">Enregistrement modifié <span class="muted">cloudflare</span></div>
            <div class="diff del"><span>-</span><code>A&nbsp; @&nbsp; 76.76.21.21</code></div>
            <div class="diff add"><span>+</span><code>A&nbsp; @&nbsp; 104.21.4.7</code></div>
            <div class="muted small">Modifié il y a 3 h · ne pointe plus vers Vercel</div>
          </template>

          <!-- 4. Env vars -->
          <template v-else-if="c.id === 'env'">
            <div class="ui-head">Variables d'environnement</div>
            <div class="trow head"><span>Nom</span><span>Preview</span><span>Production</span></div>
            <div class="trow">
              <code>STRIPE_SECRET_KEY</code><span class="okc">✓</span><span class="badc">✗</span>
            </div>
            <div class="trow">
              <code>DATABASE_URL</code><span class="okc">✓</span><span class="okc">✓</span>
            </div>
          </template>

          <!-- 5. SSL -->
          <template v-else-if="c.id === 'ssl'">
            <div class="ui-head">Certificat SSL <span class="muted">exemple.fr</span></div>
            <p class="big">Le certificat expire dans <b>6 jours</b></p>
            <div class="bar"><i class="warn" style="width: 92%"></i></div>
            <div class="muted small">Renouvellement automatique : échec</div>
          </template>

          <!-- 6. Quota -->
          <template v-else>
            <div class="ui-head">Utilisation <span class="muted">ce mois-ci</span></div>
            <p class="big">Fonctions · <b>92 % du quota</b></p>
            <div class="bar"><i class="warn" style="width: 92%"></i></div>
            <div class="muted small">92 000 / 100 000 invocations</div>
          </template>
        </div>

        <div class="text">
          <h3>{{ c.title }}</h3>
          <p>{{ c.text }}</p>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 40px;
  min-height: 460px;
  padding: 16px;
  background-color: var(--prussian);
  color: var(--paper);
  overflow: hidden;
}
.bg {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 100%;
  height: 75%;
  object-fit: cover;
  object-position: bottom;
}
.shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    0deg,
    rgba(27, 58, 140, 0.85) 0%,
    rgba(27, 58, 140, 0.35) 55%,
    rgba(27, 58, 140, 0) 100%
  );
}
.text {
  position: relative;
}
.text h3 {
  color: var(--paper);
  font-size: 28px;
  margin-bottom: 10px;
}
.text p {
  font-size: 15px;
  opacity: 0.92;
  max-width: 34ch;
}

/* Product mockup: crisp light UI, status colours allowed */
.ui {
  position: relative;
  background: #fff;
  color: var(--navy-ink);
  font-family: var(--font-sans);
  font-size: 12px;
  line-height: 1.4;
  border: 1px solid rgba(11, 22, 64, 0.12);
  padding: 12px;
  box-shadow: 0 6px 20px rgba(11, 22, 64, 0.25);
}
.ui-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.muted {
  color: rgba(11, 22, 64, 0.55);
  font-weight: 400;
}
.small {
  font-size: 11px;
  margin-top: 8px;
}
.ui code {
  font-family: var(--font-mono);
  font-size: 11px;
}
.row {
  display: grid;
  grid-template-columns: 8px 1fr auto auto;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-top: 1px solid rgba(11, 22, 64, 0.1);
}
.bad-row {
  background: rgba(192, 57, 43, 0.07);
  margin-inline: -12px;
  padding-inline: 12px;
}
.dot {
  width: 8px;
  height: 8px;
  display: block;
}
.dot.ok {
  background: var(--status-ok);
}
.dot.bad {
  background: var(--status-bad);
}
.tag {
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 1px 6px;
}
.tag.bad {
  background: rgba(192, 57, 43, 0.12);
  color: var(--status-bad);
}
.tag.ok {
  background: rgba(46, 139, 87, 0.12);
  color: var(--status-ok);
}
.diff {
  display: flex;
  gap: 8px;
  padding: 4px 6px;
  font-family: var(--font-mono);
  font-size: 11px;
}
.diff.del {
  background: rgba(192, 57, 43, 0.1);
  color: var(--status-bad);
}
.diff.add {
  background: rgba(46, 139, 87, 0.1);
  color: var(--status-ok);
  margin-top: 2px;
}
.trow {
  display: grid;
  grid-template-columns: 1.6fr 0.7fr 0.9fr;
  gap: 8px;
  padding: 6px 0;
  border-top: 1px solid rgba(11, 22, 64, 0.1);
}
.trow.head {
  color: rgba(11, 22, 64, 0.55);
  font-size: 11px;
  border-top: 0;
}
.okc {
  color: var(--status-ok);
  font-weight: 700;
}
.badc {
  color: var(--status-bad);
  font-weight: 700;
}
.big {
  font-size: 14px;
  margin-bottom: 10px;
}
.bar {
  height: 8px;
  background: rgba(11, 22, 64, 0.1);
}
.bar i {
  display: block;
  height: 100%;
  background: var(--status-warn);
}

@media (max-width: 1000px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 640px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .card {
    min-height: 420px;
  }
}
</style>
