<script setup lang="ts">
import LandingPrimaryCta from './PrimaryCta.vue'

const year = new Date().getFullYear()
</script>

<template>
  <section class="final-cta">
    <div class="final-cta__pill">Beta kayıtları açık</div>
    <h2>Beta'ya Katıl</h2>
    <p>Gerçek zamanlı iletişimin geleceğini birlikte şekillendirin.</p>

    <div class="final-cta__actions">
      <LandingPrimaryCta size="lg" />
      <span class="final-cta__subcopy">Beta süresince ücretsiz - kredi kartı gerekmez</span>
    </div>

    <div class="final-cta__footer">
      <span>(c) {{ year }} Kergit - TR</span>
      <span>performans odaklı gerçek zamanlı iletişim</span>
      <span class="final-cta__status">
        <span class="final-cta__status-dot" />
        Tüm sistemler çalışıyor
      </span>
    </div>
  </section>
</template>

<style scoped>
.final-cta {
  position: relative;
  padding: 6rem 0 4rem;
  text-align: center;
}

.final-cta__pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(139, 92, 246, 0.22);
  border-radius: 999px;
  padding: 0.5rem 0.95rem;
  color: #c4b5fd;
  background: rgba(139, 92, 246, 0.09);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.final-cta h2 {
  margin: 1.2rem 0 0;
  color: #f8fbff;
  font-family: 'Space Grotesk', 'Manrope', sans-serif;
  font-size: clamp(2.8rem, 6vw, 4.6rem);
  font-weight: 700;
  letter-spacing: -0.06em;
  line-height: 0.95;
}

.final-cta p {
  margin: 1rem auto 0;
  max-width: 34rem;
  color: rgba(177, 186, 216, 0.82);
  font-size: clamp(1rem, 1.5vw, 1.18rem);
  line-height: 1.8;
}

.final-cta__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 2rem;
}

.final-cta__subcopy {
  color: rgba(125, 146, 202, 0.7);
  font-size: 0.92rem;
}

.final-cta__footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1rem 2rem;
  margin-top: 5rem;
  color: rgba(125, 146, 202, 0.56);
  font-family: 'Space Grotesk', 'Manrope', sans-serif;
  font-size: 0.78rem;
  letter-spacing: 0.04em;
}

.final-cta__status {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.final-cta__status-dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 999px;
  background: #34d399;
  box-shadow: 0 0 14px rgba(52, 211, 153, 0.58);
}
</style>
