<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import ArticleCard from '../components/ArticleCard.vue';
import Icon from '../components/Icon.vue';
import { auth, logout } from '../auth';
import { formatMonth, formatPrice } from '../format';
import { articlesVersion, closeForm, deleteArticle, openCreate, openEdit, removingId, showToast } from '../ui';

const MAX_ARTICLES = 100;

const router = useRouter();

const articles = ref([]);
const status = ref('loading'); // 'loading' | 'ready' | 'error'

// La page est protégée par le routeur, mais la session peut expirer pendant qu'elle est affichée.
const user = computed(() => auth.user);

const initial = computed(() => (user.value?.email[0] || '?').toUpperCase());
const totalValue = computed(() => articles.value.reduce((sum, article) => sum + Number(article.price), 0));
const withPhoto = computed(() => articles.value.filter((article) => article.image_updated_at).length);

async function load({ quiet = false } = {}) {
  if (!user.value) return;
  if (!quiet) status.value = 'loading';

  try {
    const params = new URLSearchParams({ user_id: user.value.id, limit: MAX_ARTICLES });
    const res = await fetch(`/api/articles?${params}`);
    if (!res.ok) throw new Error(res.statusText);
    articles.value = await res.json();
    status.value = 'ready';
  } catch {
    status.value = 'error';
  }
}

watch(articlesVersion, () => load({ quiet: true }));

// Session expirée ou déconnexion : le profil n'a plus lieu d'être.
watch(user, (value) => { if (!value) router.push({ name: 'home' }); });

async function onLogout() {
  closeForm();
  await logout();
  showToast('Vous êtes déconnecté');
}

onMounted(() => load());
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
        <button class="btn btn-ghost" type="button" @click="onLogout"><Icon name="logout" />Déconnexion</button>
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

      <div v-else-if="articles.length === 0" class="state">
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
    </main>
  </div>
</template>
