<script setup lang="ts">
import { useHead } from '#imports'

useHead({
  title: 'Switchyard — Suivez tout le chemin de votre projet',
  meta: [
    {
      name: 'description',
      content:
        "Switchyard : suivez tout le chemin de votre projet, du nom de domaine jusqu'aux paiements, et repérez ce qui bloque avant vos utilisateurs.",
    },
    { name: 'theme-color', content: '#1B3A8C' },
  ],
})
</script>

<template>
  <div>
    <main>
      <LandingHeroSection />
      <div class="frame">
        <LandingProblemSection />
        <LandingSolutionSection />
      </div>
      <LandingBandSection />
      <div class="frame">
        <LandingFeaturesSection />
        <LandingIntegrationsSection />
        <LandingLexiconSection />
        <LandingPrinciplesSection />
        <LandingRoadmapSection />
      </div>
      <LandingCtaSection />
    </main>
    <LandingFooterSection />
  </div>
</template>
