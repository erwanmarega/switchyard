<script setup>
defineProps({ id: String, title: String })
</script>

<template>
  <header class="head">
    <h2 :id="id">{{ title }}</h2>
    <p><slot /></p>
  </header>
</template>

<style scoped>
.head {
  display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: end; margin-bottom: 56px;
}
h2 { font-size: clamp(32px, 4.4vw, 56px); text-wrap: balance; }
p { max-width: 52ch; font-size: 16px; line-height: 1.55; }
@media (max-width: 820px) {
  .head { grid-template-columns: 1fr; gap: 20px; margin-bottom: 36px; }
}
</style>
