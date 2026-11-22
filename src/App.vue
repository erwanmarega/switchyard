<script setup>
import HeroSection from './components/HeroSection.vue'
import ProblemSection from './components/ProblemSection.vue'
import SolutionSection from './components/SolutionSection.vue'
import BandSection from './components/BandSection.vue'
import FeaturesSection from './components/FeaturesSection.vue'
import IntegrationsSection from './components/IntegrationsSection.vue'
import LexiconSection from './components/LexiconSection.vue'
import PrinciplesSection from './components/PrinciplesSection.vue'
import RoadmapSection from './components/RoadmapSection.vue'
import CtaSection from './components/CtaSection.vue'
import FooterSection from './components/FooterSection.vue'
</script>

<template>
  <main>
    <HeroSection />
    <div class="frame">
      <ProblemSection />
      <SolutionSection />
    </div>
    <BandSection />
    <div class="frame">
      <FeaturesSection />
      <IntegrationsSection />
      <LexiconSection />
      <PrinciplesSection />
      <RoadmapSection />
    </div>
    <CtaSection />
  </main>
  <FooterSection />
</template>
