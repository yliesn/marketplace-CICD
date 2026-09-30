<script setup>
import { RouterLink } from 'vue-router';
import Icon from '../components/Icon.vue';
</script>

<template>
  <main class="container page">
    <div class="state">
      <span class="state-icon"><Icon name="search" size="26" /></span>
      <h1 class="state-title">Cette page n'existe pas</h1>
      <p class="muted">L'adresse est peut-être incorrecte, ou la page a été retirée.</p>
      <RouterLink class="btn btn-primary" :to="{ name: 'home' }">Voir les annonces</RouterLink>
    </div>
  </main>
</template>
