<script setup>
import { ref, watch } from 'vue';
import Icon from './Icon.vue';

// Champ mot de passe avec un bouton pour afficher ou masquer la saisie.
// Les attributs (id, autocomplete, aria-invalid, @input…) sont transmis au champ lui-même.
defineOptions({ inheritAttrs: false });

const model = defineModel({ type: String, default: '' });

const visible = ref(false);

// Champ vidé (formulaire envoyé ou réinitialisé) : le mot de passe est de nouveau masqué.
watch(model, (value) => { if (!value) visible.value = false; });
</script>

<template>
  <div class="password-input">
    <input v-model="model" v-bind="$attrs" class="input" :type="visible ? 'text' : 'password'" autocapitalize="off" spellcheck="false">
    <button
      class="password-toggle"
      type="button"
      aria-label="Afficher le mot de passe"
      :aria-pressed="visible ? 'true' : 'false'"
      :title="visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'"
      @click="visible = !visible"
    >
      <Icon :name="visible ? 'eye-off' : 'eye'" size="18" />
    </button>
  </div>
</template>
