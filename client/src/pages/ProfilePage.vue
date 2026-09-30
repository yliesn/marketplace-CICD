<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import ArticleCard from '../components/ArticleCard.vue';
import Icon from '../components/Icon.vue';
import { auth, canEdit, changePassword, logout } from '../auth';
import { formatMonth, formatPrice } from '../format';
import { articlesVersion, closeForm, deleteArticle, favoritesVersion, openCreate, openEdit, removingId, showToast } from '../ui';

const MAX_ARTICLES = 100;
const MIN_PASSWORD = 8;

const router = useRouter();

const articles = ref([]);
const favorites = ref([]);
const status = ref('loading'); // 'loading' | 'ready' | 'error'

// La page est protégée par le routeur, mais la session peut expirer pendant qu'elle est affichée.
const user = computed(() => auth.user);

const initial = computed(() => (user.value?.email[0] || '?').toUpperCase());
const totalValue = computed(() => articles.value.reduce((sum, article) => sum + Number(article.price), 0));
const withPhoto = computed(() => articles.value.filter((article) => article.image_updated_at).length);

async function fetchArticles(query) {
  const res = await fetch(`/api/articles?${new URLSearchParams({ ...query, limit: MAX_ARTICLES })}`);
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

async function load({ quiet = false } = {}) {
  if (!user.value) return;
  if (!quiet) status.value = 'loading';

  try {
    [articles.value, favorites.value] = await Promise.all([
      fetchArticles({ user_id: user.value.id }),
      fetchArticles({ favorites: 1 }),
    ]);
    status.value = 'ready';
  } catch {
    status.value = 'error';
  }
}

watch([articlesVersion, favoritesVersion], () => load({ quiet: true }));

// Session expirée ou déconnexion : le profil n'a plus lieu d'être.
watch(user, (value) => { if (!value) router.push({ name: 'home' }); });

async function onLogout() {
  closeForm();
  await logout();
  showToast('Vous êtes déconnecté');
}

onMounted(() => load());

// ---------- Changement de mot de passe ----------

const passwordDialog = ref(null);
const passwordFields = reactive({ current: '', next: '' });
const passwordError = ref('');
const passwordSubmitting = ref(false);

function openPassword() {
  passwordFields.current = '';
  passwordFields.next = '';
  passwordError.value = '';
  passwordDialog.value.showModal();
}

async function onChangePassword() {
  if (!passwordFields.current || passwordFields.next.length < MIN_PASSWORD) {
    passwordError.value = passwordFields.current
      ? `Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD} caractères.`
      : 'Le mot de passe actuel est obligatoire.';
    await nextTick();
    passwordDialog.value.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  passwordSubmitting.value = true;
  try {
    await changePassword(passwordFields.current, passwordFields.next);
    passwordDialog.value.close();
    showToast('Mot de passe modifié');
  } catch (err) {
    passwordError.value = err.message;
  } finally {
    passwordSubmitting.value = false;
  }
}
</script>

<template>
  <div v-if="user">
    <section class="profile-head">
      <div class="container profile-head-inner">
        <span class="profile-avatar" aria-hidden="true">{{ initial }}</span>
        <div class="profile-identity">
          <h1>Mon profil</h1>
          <p class="profile-email">
            {{ user.email }}
            <span v-if="user.role === 'admin'" class="badge badge-new">Administrateur</span>
          </p>
          <p v-if="user.created_at" class="small">Membre depuis {{ formatMonth(user.created_at) }}</p>
        </div>
        <div class="profile-actions">
          <RouterLink v-if="user.role === 'admin'" class="btn btn-secondary" :to="{ name: 'admin' }"><Icon name="shield" />Administration</RouterLink>
          <button class="btn btn-secondary" type="button" @click="openPassword"><Icon name="key" />Changer le mot de passe</button>
          <button class="btn btn-ghost" type="button" @click="onLogout"><Icon name="logout" />Déconnexion</button>
        </div>
      </div>
    </section>

    <main class="container page" aria-labelledby="mine-title">
      <dl v-if="status === 'ready' && articles.length" class="stats">
        <div>
          <dt>Annonces en ligne</dt>
          <dd>{{ articles.length }}</dd>
        </div>
        <div>
          <dt>Valeur de la collection en vente</dt>
          <dd>{{ formatPrice(totalValue) }}</dd>
        </div>
        <div>
          <dt>Annonces avec photo</dt>
          <dd>{{ withPhoto }} sur {{ articles.length }}</dd>
        </div>
      </dl>

      <div class="page-head profile-listing-head">
        <h2 id="mine-title">Mes annonces</h2>
        <button class="btn btn-primary btn-sm" type="button" @click="openCreate"><Icon name="plus" />Mettre en vente</button>
      </div>

      <ul v-if="status === 'loading'" class="grid">
        <li v-for="n in 4" :key="n" class="card skeleton" aria-hidden="true">
          <div class="sk sk-thumb" />
          <div class="sk sk-line" />
          <div class="sk sk-line short" />
        </li>
      </ul>

      <div v-else-if="status === 'error'" class="state">
        <span class="state-icon"><Icon name="alert" size="26" /></span>
        <p class="state-title">Impossible de charger vos annonces</p>
        <p class="muted">Le serveur ne répond pas.</p>
        <button class="btn btn-ghost" type="button" @click="load()">Réessayer</button>
      </div>

      <template v-else>
        <div v-if="articles.length === 0" class="state">
          <span class="state-icon"><Icon name="package" size="26" /></span>
          <p class="state-title">Vous n'avez encore rien mis en vente</p>
          <p class="muted">Vous avez un objet qui dort dans un placard ? Il mérite peut-être une nouvelle collection.</p>
          <button class="btn btn-primary" type="button" @click="openCreate"><Icon name="plus" />Mettre en vente</button>
        </div>

        <ul v-else class="grid">
          <ArticleCard
            v-for="article in articles"
            :key="article.id"
            :article="article"
            :removing="removingId === article.id"
            can-edit
            @edit="openEdit"
            @delete="deleteArticle"
          />
        </ul>

        <section class="related" aria-labelledby="favorites-title">
          <h2 id="favorites-title">Mes favoris</h2>
          <p v-if="favorites.length === 0" class="muted favorites-empty">
            Touchez le cœur d'une annonce pour la retrouver ici.
          </p>
          <ul v-else class="grid">
            <ArticleCard
              v-for="article in favorites"
              :key="article.id"
              :article="article"
              :removing="removingId === article.id"
              :can-edit="canEdit(article)"
              @edit="openEdit"
              @delete="deleteArticle"
            />
          </ul>
        </section>
      </template>
    </main>

    <dialog ref="passwordDialog" class="dialog dialog-form" aria-labelledby="password-title">
      <div class="dialog-head">
        <div>
          <h2 id="password-title">Changer le mot de passe</h2>
          <p class="muted small">Vos autres appareils seront déconnectés.</p>
        </div>
        <button class="icon-btn" type="button" aria-label="Fermer" title="Fermer" @click="passwordDialog.close()"><Icon name="x" size="18" /></button>
      </div>

      <form novalidate @submit.prevent="onChangePassword">
        <!-- Aide les gestionnaires de mots de passe à associer le changement au bon compte. -->
        <input class="visually-hidden" type="email" name="email" autocomplete="username" :value="user.email" tabindex="-1" aria-hidden="true" readonly>

        <div class="field">
          <label for="current-password"><Icon name="lock" />Mot de passe actuel</label>
          <input
            id="current-password"
            v-model="passwordFields.current"
            class="input"
            type="password"
            maxlength="200"
            autocomplete="current-password"
            required
            :aria-invalid="passwordError && !passwordFields.current ? 'true' : 'false'"
            @input="passwordError = ''"
          >
        </div>

        <div class="field">
          <div class="label-row">
            <label for="new-password"><Icon name="key" />Nouveau mot de passe</label>
            <span class="muted small">{{ MIN_PASSWORD }} caractères minimum</span>
          </div>
          <input
            id="new-password"
            v-model="passwordFields.next"
            class="input"
            type="password"
            maxlength="200"
            autocomplete="new-password"
            required
            :aria-invalid="passwordError && passwordFields.current && passwordFields.next.length < MIN_PASSWORD ? 'true' : 'false'"
            @input="passwordError = ''"
          >
        </div>

        <p v-if="passwordError" class="alert" role="alert">{{ passwordError }}</p>

        <div class="dialog-actions">
          <button class="btn btn-secondary" type="button" @click="passwordDialog.close()">Annuler</button>
          <button class="btn btn-primary" type="submit" :disabled="passwordSubmitting">
            {{ passwordSubmitting ? 'Enregistrement…' : 'Enregistrer' }}
          </button>
        </div>
      </form>
    </dialog>
  </div>
</template>
