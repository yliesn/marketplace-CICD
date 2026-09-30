<script setup>
// Logo Collector : étiquette + étoile, avec ou sans le nom (voir docs/charte-graphique.md).
defineProps({
  symbolOnly: Boolean,
  height: { type: [Number, String], default: 32 },
});
</script>

<template>
  <span class="logo">
    <svg viewBox="3 11 106 68" :height="height" :width="height * 106 / 68" aria-hidden="true">
      <path d="M20 15H75L105 45L75 75H20C12 75 7 70 7 62V28C7 20 12 15 20 15Z" fill="#F3E8D0" stroke="#20252B" stroke-width="5" stroke-linejoin="round" />
      <circle cx="24" cy="45" r="6" fill="#E85D3F" stroke="#20252B" stroke-width="3" />
      <path d="M62 27L67 39L80 40L70 48L73 61L62 54L51 61L54 48L44 40L57 39Z" fill="#E85D3F" />
    </svg>
    <span v-if="!symbolOnly" class="logo-name">Collector</span>
  </span>
</template>
