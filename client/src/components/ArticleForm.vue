<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { imageUrl } from '../format';
import Icon from './Icon.vue';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const props = defineProps({
  // Article en cours de modification, ou null pour une création.
  editing: { type: Object, default: null },
  open: Boolean,
});

const emit = defineEmits(['saved', 'cancel', 'gone']);

const dialog = ref(null);
const fileInput = ref(null);

const fields = reactive({ title: '', description: '', price: '' });
const errors = reactive({ title: '', price: '', image: '' });
const formError = ref('');
const submitting = ref(false);
const file = ref(null);
const removeImage = ref(false); // photo existante à supprimer à l'enregistrement
const previewUrl = ref(null);

const isEdit = computed(() => props.editing !== null);

const submitLabel = computed(() => {
  if (submitting.value) return isEdit.value ? 'Enregistrement…' : 'Publication…';
  return isEdit.value ? 'Enregistrer' : "Publier l'annonce";
});

// Aperçu : le fichier choisi, sinon la photo actuelle de l'article en cours de modification.
const previewSrc = computed(() => {
  if (previewUrl.value) return previewUrl.value;
  if (props.editing?.image_updated_at && !removeImage.value) return imageUrl(props.editing);
  return null;
});

function setFile(value) {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  file.value = value;
  previewUrl.value = value ? URL.createObjectURL(value) : null;
  if (!value && fileInput.value) fileInput.value.value = '';
}

function clearErrors() {
  errors.title = '';
  errors.price = '';
  errors.image = '';
  formError.value = '';
}

function fill(article) {
  fields.title = article ? article.title : '';
  fields.description = article ? article.description || '' : '';
  fields.price = article ? Number(article.price) : '';
  clearErrors();
  setFile(null);
  removeImage.value = false;
}

watch(() => props.editing, fill);

watch(() => props.open, async (open) => {
  if (!open) {
    dialog.value.close();
    return;
  }
  clearErrors();
  await nextTick(); // le formulaire est rempli avant l'ouverture
  if (!dialog.value.open) dialog.value.showModal();
});

onBeforeUnmount(() => setFile(null));

function onFileChange(event) {
  const chosen = event.target.files[0] || null;
  let message = '';
  if (chosen && !IMAGE_TYPES.includes(chosen.type)) {
    message = 'Formats acceptés : JPEG, PNG ou WebP.';
  } else if (chosen && chosen.size > MAX_IMAGE_SIZE) {
    message = 'La photo ne doit pas dépasser 2 Mo.';
  }
  errors.image = message;
  setFile(message ? null : chosen);
}

function onRemoveImage() {
  // Un fichier choisi : on l'annule. Sinon, on retire la photo déjà enregistrée.
  if (file.value) setFile(null);
  else removeImage.value = true;
  errors.image = '';
}

function validate() {
  const price = fields.price;
  errors.title = fields.title.trim() ? '' : 'Le titre est obligatoire.';

  if (price === '') {
    errors.price = 'Le prix est obligatoire.';
  } else if (Number(price) < 0 || !Number.isFinite(Number(price))) {
    errors.price = 'Le prix doit être un nombre positif.';
  } else {
    errors.price = '';
  }
  return !errors.title && !errors.price;
}

// Envoie ou supprime la photo une fois l'article enregistré. Retourne false en cas d'échec.
async function saveImage(id) {
  if (!file.value && !removeImage.value) return true;
  try {
    const res = await fetch(`/api/articles/${id}/image`, file.value
      ? { method: 'PUT', headers: { 'Content-Type': file.value.type }, body: file.value }
      : { method: 'DELETE' });
    return res.ok || (!file.value && res.status === 404);
  } catch {
    return false;
  }
}

async function onSubmit() {
  formError.value = '';
  if (!validate()) {
    await nextTick();
    dialog.value.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  const edited = props.editing;
  submitting.value = true;

  try {
    const res = await fetch(edited ? `/api/articles/${edited.id}` : '/api/articles', {
      method: edited ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: fields.title,
        description: fields.description,
        price: Number(fields.price),
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.status === 404 && edited) {
      emit('gone');
      await nextTick(); // laisse le formulaire se réinitialiser avant d'afficher l'erreur
      throw new Error("Cet article n'existe plus.");
    }
    if (res.status === 401) {
      throw new Error('Votre session a expiré. Reconnectez-vous pour enregistrer cette annonce.');
    }
    if (!res.ok) {
      throw new Error((data.errors || [data.error || "Erreur lors de l'enregistrement"]).join(', '));
    }

    const imageSaved = await saveImage(data.id);
    if (!edited) fill(null);
    emit('saved', { isEdit: Boolean(edited), imageSaved });
  } catch (err) {
    formError.value = err.message || "Erreur lors de l'enregistrement";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <dialog ref="dialog" class="dialog dialog-form" aria-labelledby="publish-title" @close="$emit('cancel')">
    <div class="dialog-head">
      <div>
        <h2 id="publish-title">{{ isEdit ? "Modifier l'annonce" : 'Mettre un objet en vente' }}</h2>
        <p class="muted small">
          {{ isEdit ? 'Les modifications sont visibles immédiatement.' : 'Elle sera visible immédiatement par tout le monde.' }}
        </p>
      </div>
      <button class="icon-btn" type="button" aria-label="Fermer" title="Fermer" @click="$emit('cancel')"><Icon name="x" size="18" /></button>
    </div>

    <form novalidate @submit.prevent="onSubmit">
      <div class="field">
        <label for="title"><Icon name="tag" />Titre</label>
        <input
          id="title"
          v-model="fields.title"
          autofocus
          name="title"
          class="input"
          type="text"
          maxlength="255"
          placeholder="Ex. Figurine Star Wars de 1995"
          required
          :aria-invalid="errors.title ? 'true' : 'false'"
          @input="errors.title = ''"
        >
        <p class="field-error">{{ errors.title }}</p>
      </div>

      <div class="field">
        <div class="label-row">
          <label for="description"><Icon name="text" />Description</label>
          <span class="muted small">{{ fields.description.length }} / 500</span>
        </div>
        <textarea
          id="description"
          v-model="fields.description"
          name="description"
          class="input"
          rows="4"
          maxlength="500"
          placeholder="État, année, emballage d'origine, histoire de l'objet…"
        />
      </div>

      <div class="field">
        <div class="label-row">
          <label for="image"><Icon name="camera" />Photo</label>
          <span class="muted small">JPEG, PNG ou WebP · 2 Mo max</span>
        </div>
        <input
          id="image"
          ref="fileInput"
          name="image"
          class="input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          :aria-invalid="errors.image ? 'true' : 'false'"
          @change="onFileChange"
        >
        <div v-if="previewSrc" class="image-preview">
          <img :src="previewSrc" alt="Aperçu de la photo">
          <button class="btn btn-ghost btn-sm" type="button" @click="onRemoveImage"><Icon name="trash" />Retirer la photo</button>
        </div>
        <p class="field-error">{{ errors.image }}</p>
      </div>

      <div class="field">
        <label for="price"><Icon name="euro" />Prix</label>
        <div class="input-suffix">
          <input
            id="price"
            v-model="fields.price"
            name="price"
            class="input"
            type="number"
            min="0"
            step="0.01"
            inputmode="decimal"
            placeholder="0,00"
            required
            :aria-invalid="errors.price ? 'true' : 'false'"
            @input="errors.price = ''"
          >
          <span aria-hidden="true">€</span>
        </div>
        <p class="field-error">{{ errors.price }}</p>
      </div>

      <p v-if="formError" class="alert" role="alert">{{ formError }}</p>

      <div class="dialog-actions">
        <button class="btn btn-secondary" type="button" @click="$emit('cancel')">Annuler</button>
        <button class="btn btn-primary" type="submit" :disabled="submitting">{{ submitLabel }}</button>
      </div>
    </form>
  </dialog>
</template>
