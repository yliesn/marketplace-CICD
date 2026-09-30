<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { login, register } from '../auth';
import { RouterLink, onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { forgetPendingCreate, resumeAfterLogin, showToast } from '../ui';
import Icon from '../components/Icon.vue';

const MIN_PASSWORD = 8;

const props = defineProps({
  // 'login' ou 'register'
  mode: { type: String, required: true },
});

const route = useRoute();
const router = useRouter();

// Après connexion : on reprend la mise en vente demandée, ou on retourne à la page
// d'où l'on vient (?suite=/profil), sinon à l'accueil.
async function goNext() {
  const resumed = resumeAfterLogin();
  const next = route.query.suite;
  const safe = typeof next === 'string' && next.startsWith('/') && !next.startsWith('//');
  await router.replace(!resumed && safe ? next : { name: 'home' });
}

// Quitter la connexion sans se connecter annule la mise en vente en attente.
onBeforeRouteLeave((to) => {
  if (!to.meta.guestOnly) forgetPendingCreate();
});

const form = ref(null);
const emailInput = ref(null);

const fields = reactive({ email: '', password: '' });
const errors = reactive({ email: '', password: '' });
const formError = ref('');
const submitting = ref(false);

const isRegister = computed(() => props.mode === 'register');

const submitLabel = computed(() => {
  if (submitting.value) return isRegister.value ? 'Création…' : 'Connexion…';
  return isRegister.value ? 'Créer mon compte' : 'Se connecter';
});

function clearErrors() {
  errors.email = '';
  errors.password = '';
  formError.value = '';
}

// Passage de la connexion à l'inscription (ou l'inverse) : on garde l'email saisi.
watch(() => props.mode, () => {
  fields.password = '';
  clearErrors();
  emailInput.value?.focus();
});

onMounted(() => emailInput.value?.focus());

function validate() {
  errors.email = fields.email.trim() ? '' : "L'email est obligatoire.";

  if (!fields.password) {
    errors.password = 'Le mot de passe est obligatoire.';
  } else if (isRegister.value && fields.password.length < MIN_PASSWORD) {
    errors.password = `Le mot de passe doit contenir au moins ${MIN_PASSWORD} caractères.`;
  } else {
    errors.password = '';
  }
  return !errors.email && !errors.password;
}

async function onSubmit() {
  formError.value = '';
  if (!validate()) {
    await nextTick();
    form.value.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  submitting.value = true;
  try {
    await (isRegister.value ? register : login)(fields.email, fields.password);
    fields.password = '';
    showToast(isRegister.value ? 'Compte créé' : 'Connexion réussie');
    await goNext();
  } catch (err) {
    formError.value = err.message || 'Une erreur est survenue';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="auth-page">
    <div class="auth-aside" aria-hidden="true">
      <svg viewBox="3 11 106 68">
        <path d="M20 15H75L105 45L75 75H20C12 75 7 70 7 62V28C7 20 12 15 20 15Z" fill="#FFFFFF" stroke="#20252B" stroke-width="3" stroke-linejoin="round" />
        <circle cx="24" cy="45" r="6" fill="#E85D3F" stroke="#20252B" stroke-width="2.5" />
        <path d="M62 27L67 39L80 40L70 48L73 61L62 54L51 61L54 48L44 40L57 39Z" fill="#E85D3F" />
      </svg>
      <p class="auth-quote">Les objets ont une histoire.</p>
      <p>Trouvez quelqu'un qui recherche exactement ce que vous possédez.</p>
    </div>

    <div class="auth-main">
      <div class="auth-box">
        <RouterLink class="btn btn-link small" :to="{ name: 'home' }">
          <Icon name="chevron-left" />Retour aux annonces
        </RouterLink>

        <h1>{{ isRegister ? 'Créer un compte' : 'Connexion' }}</h1>
        <p class="muted">
          {{ isRegister
            ? 'Un compte permet de mettre vos objets en vente et de gérer vos annonces.'
            : 'Connectez-vous pour mettre vos objets en vente et gérer vos annonces.' }}
        </p>

        <form ref="form" novalidate @submit.prevent="onSubmit">
          <div class="field">
            <label for="auth-email"><Icon name="mail" />Email</label>
            <input
              id="auth-email"
              ref="emailInput"
              v-model="fields.email"
              name="email"
              class="input"
              type="email"
              maxlength="255"
              autocomplete="email"
              required
              :aria-invalid="errors.email ? 'true' : 'false'"
              @input="errors.email = ''"
            >
            <p class="field-error">{{ errors.email }}</p>
          </div>

          <div class="field">
            <div class="label-row">
              <label for="auth-password"><Icon name="lock" />Mot de passe</label>
              <span v-if="isRegister" class="muted small">{{ MIN_PASSWORD }} caractères minimum</span>
            </div>
            <input
              id="auth-password"
              v-model="fields.password"
              name="password"
              class="input"
              type="password"
              maxlength="200"
              :autocomplete="isRegister ? 'new-password' : 'current-password'"
              required
              :aria-invalid="errors.password ? 'true' : 'false'"
              @input="errors.password = ''"
            >
            <p class="field-error">{{ errors.password }}</p>
          </div>

          <p v-if="formError" class="alert" role="alert">{{ formError }}</p>

          <button class="btn btn-primary btn-block" type="submit" :disabled="submitting">{{ submitLabel }}</button>
        </form>

        <p class="auth-switch">
          <template v-if="isRegister">
            Vous avez déjà un compte ?
            <RouterLink class="btn btn-link" :to="{ name: 'login', query: route.query }">Se connecter</RouterLink>
          </template>
          <template v-else>
            Pas encore de compte ?
            <RouterLink class="btn btn-link" :to="{ name: 'register', query: route.query }">Créer un compte</RouterLink>
          </template>
        </p>
      </div>
    </div>
  </main>
</template>
