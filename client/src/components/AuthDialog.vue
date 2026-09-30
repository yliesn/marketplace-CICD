<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { login, register } from '../auth';

const MIN_PASSWORD = 8;

const props = defineProps({
  open: Boolean,
});

const emit = defineEmits(['done', 'cancel']);

const dialog = ref(null);

const mode = ref('login'); // 'login' ou 'register'
const fields = reactive({ email: '', password: '' });
const errors = reactive({ email: '', password: '' });
const formError = ref('');
const submitting = ref(false);

const isRegister = computed(() => mode.value === 'register');

const submitLabel = computed(() => {
  if (submitting.value) return isRegister.value ? 'Création…' : 'Connexion…';
  return isRegister.value ? 'Créer mon compte' : 'Se connecter';
});

function clearErrors() {
  errors.email = '';
  errors.password = '';
  formError.value = '';
}

function toggleMode() {
  mode.value = isRegister.value ? 'login' : 'register';
  clearErrors();
}

watch(() => props.open, async (open) => {
  if (!open) {
    dialog.value.close();
    return;
  }
  mode.value = 'login';
  fields.password = '';
  clearErrors();
  await nextTick();
  if (!dialog.value.open) dialog.value.showModal();
});

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
    dialog.value.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  submitting.value = true;
  try {
    await (isRegister.value ? register : login)(fields.email, fields.password);
    fields.password = '';
    emit('done', { registered: isRegister.value });
  } catch (err) {
    formError.value = err.message || 'Une erreur est survenue';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <dialog ref="dialog" class="dialog dialog-form" aria-labelledby="auth-title" @close="$emit('cancel')">
    <div class="dialog-head">
      <div>
        <h2 id="auth-title">{{ isRegister ? 'Créer un compte' : 'Connexion' }}</h2>
        <p class="muted small">
          {{ isRegister ? 'Un compte permet de déposer et de gérer vos annonces.' : 'Connectez-vous pour déposer et gérer vos annonces.' }}
        </p>
      </div>
      <button class="btn btn-link" type="button" @click="$emit('cancel')">Fermer</button>
    </div>

    <form novalidate @submit.prevent="onSubmit">
      <div class="field">
        <label for="auth-email">Email</label>
        <input
          id="auth-email"
          v-model="fields.email"
          autofocus
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
          <label for="auth-password">Mot de passe</label>
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

      <div class="dialog-actions auth-actions">
        <button class="btn btn-link small" type="button" @click="toggleMode">
          {{ isRegister ? "J'ai déjà un compte" : 'Créer un compte' }}
        </button>
        <button class="btn btn-primary" type="submit" :disabled="submitting">{{ submitLabel }}</button>
      </div>
    </form>
  </dialog>
</template>
