<template>
  <section class="band" aria-label="Citation">
    <img
      :src="'/img/band-semaphore.webp'"
      alt=""
      aria-hidden="true"
      width="2400"
      height="900"
      loading="lazy"
      decoding="async"
    />
    <div class="shade" aria-hidden="true"></div>
    <blockquote>Quand un maillon casse, Switchyard vous montre où et pourquoi.</blockquote>
  </section>
</template>

<style scoped>
.band {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 440px;
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
blockquote {
  position: relative;
  margin: 0;
  font-family: var(--font-pixel);
  font-size: clamp(32px, 5vw, 68px);
  line-height: 0.98;
  text-wrap: balance;
}
blockquote {
  max-width: 18ch;
  margin-inline: max(40px, calc((100% - var(--frame)) / 2 + 40px));
  padding: 72px 0;
  width: auto;
}
@media (max-width: 820px) {
  .band {
    min-height: 360px;
  }
  blockquote {
    margin-inline: 20px;
    padding: 48px 0;
  }
}
</style>
