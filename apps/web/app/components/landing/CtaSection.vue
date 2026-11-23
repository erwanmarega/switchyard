<template>
  <section id="contribuer" class="cta" aria-labelledby="cta-title">
    <img
      :src="'/img/cta-yard.webp'"
      alt=""
      aria-hidden="true"
      width="2400"
      height="1200"
      loading="lazy"
      decoding="async"
    />
    <div class="shade" aria-hidden="true"></div>
    <div class="copy">
      <h2 id="cta-title">Montez à bord.</h2>
      <p>
        Le projet n'en est qu'au début : les idées, retours et propositions d'intégrations sont les
        bienvenus. Ouvrez une issue pour en discuter.
      </p>
      <div class="ctas">
        <a class="btn btn-light" href="#"><PixelIcon name="issue" />Ouvrir une issue</a>
        <a class="btn btn-dark" href="#"><PixelIcon name="github" />Suivre sur GitHub</a>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cta {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 520px;
  background-color: var(--prussian);
  color: var(--paper);
  overflow: hidden;
}
img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(27, 58, 140, 0.8), rgba(27, 58, 140, 0.2) 75%);
}
.copy {
  position: relative;
  margin-inline: max(40px, calc((100% - var(--frame)) / 2 + 40px));
  padding: 80px 0;
  max-width: 560px;
}
h2 {
  color: var(--paper);
  font-size: clamp(48px, 7vw, 96px);
  margin-bottom: 20px;
}
p {
  font-size: 17px;
  margin-bottom: 28px;
}
.ctas {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
@media (max-width: 820px) {
  .cta {
    min-height: 460px;
  }
  .copy {
    margin-inline: 20px;
    padding: 56px 0;
  }
}
</style>
