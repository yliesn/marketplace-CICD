<script setup>
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import ArticleCard from '../components/ArticleCard.vue';
import Icon from '../components/Icon.vue';
import { auth, canEdit } from '../auth';
import { badgesOf, categoryName } from '../catalog';
import { formatDate, formatMonth, formatPrice, imageUrl, timeAgo } from '../format';
import { articlesVersion, deleteArticle, openEdit, removingId, showToast, toggleFavorite } from '../ui';

const NEW_BADGE_MS = 24 * 60 * 60 * 1000;
const OTHERS_LIMIT = 4;

const route = useRoute();
const router = useRouter();

const article = ref(null);
const others = ref([]); // autres annonces du même vendeur
const status = ref('loading'); // 'loading' | 'ready' | 'missing' | 'error'
const imageFailed = ref(false);

let requestId = 0; // ignore les réponses obsolètes

const showImage = computed(() => Boolean(article.value?.image_updated_at) && !imageFailed.value);
const isNew = computed(() => Date.now() - new Date(article.value.created_at) < NEW_BADGE_MS);
const editable = computed(() => canEdit(article.value));
const badges = computed(() => badgesOf(article.value));
const category = computed(() => categoryName(article.value));

const sellerCountText = computed(() => {
  const count = article.value.seller_count || 0;
  return count > 1 ? `${count} annonces en ligne` : '1 annonce en ligne';
});

async function loadOthers(current) {
  try {
    // Une de plus que nécessaire : l'annonce affichée est retirée de la liste.
    const params = new URLSearchParams({ user_id: current.user_id, limit: OTHERS_LIMIT + 1 });
    const res = await fetch(`/api/articles?${params}`);
    if (!res.ok) return [];
    return (await res.json()).filter((item) => item.id !== current.id).slice(0, OTHERS_LIMIT);
  } catch {
    return [];
  }
}

async function load({ quiet = false } = {}) {
  const current = ++requestId;
  if (!quiet) {
    status.value = 'loading';
    article.value = null;
    others.value = [];
  }

  try {
    const res = await fetch(`/api/articles/${route.params.id}`);
    if (current !== requestId) return;
    if (res.status === 404) {
      status.value = 'missing';
      document.title = 'Annonce introuvable — Collector';
      return;
    }
    if (!res.ok) throw new Error(res.statusText);

    const data = await res.json();
    if (current !== requestId) return;
    article.value = data;
    imageFailed.value = false;
    status.value = 'ready';
    document.title = `${data.title} — Collector`;

    const list = data.user_id ? await loadOthers(data) : [];
    if (current === requestId) others.value = list;
  } catch {
    if (current !== requestId) return;
    status.value = 'error';
  }
}

// La même page sert à tous les objets : on recharge quand l'identifiant de l'adresse change.
watch(() => route.params.id, (id) => { if (id) load(); }, { immediate: true });

// L'annonce a été modifiée depuis le formulaire : on rafraîchit sans faire clignoter la page.
// Même chose après une connexion ou une déconnexion : l'état « favori » dépend de l'utilisateur.
watch([articlesVersion, () => auth.user?.id], () => { if (status.value === 'ready') load({ quiet: true }); });

async function onDelete() {
  if (await deleteArticle(article.value)) router.push({ name: 'home' });
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    showToast('Lien copié');
  } catch {
    showToast("Le lien n'a pas pu être copié", 'error');
  }
}
</script>

<template>
  <main class="container page">
    <RouterLink class="btn btn-link small" :to="{ name: 'home' }"><Icon name="chevron-left" />Retour aux annonces</RouterLink>

    <div v-if="status === 'loading'" class="detail skeleton" aria-hidden="true">
      <div class="sk detail-photo" />
      <div>
        <div class="sk sk-block" style="width: 70%; height: 34px" />
        <div class="sk sk-block" style="width: 30%; height: 30px" />
        <div class="sk sk-block" style="height: 120px" />
      </div>
    </div>

    <div v-else-if="status === 'missing'" class="state">
      <span class="state-icon"><Icon name="search" size="26" /></span>
      <p class="state-title">Cette annonce n'existe plus</p>
      <p class="muted">L'objet a peut-être déjà trouvé une nouvelle collection.</p>
      <RouterLink class="btn btn-primary" :to="{ name: 'home' }">Voir les annonces</RouterLink>
    </div>

    <div v-else-if="status === 'error'" class="state">
      <span class="state-icon"><Icon name="alert" size="26" /></span>
      <p class="state-title">Impossible de charger cette annonce</p>
      <p class="muted">Le serveur ne répond pas.</p>
      <button class="btn btn-ghost" type="button" @click="load()">Réessayer</button>
    </div>

    <template v-else>
      <article class="detail" :class="{ 'is-removing': removingId === article.id }">
        <div class="detail-photo">
          <img
            v-if="showImage"
            :src="imageUrl(article)"
            :alt="`Photo de « ${article.title} »`"
            @error="imageFailed = true"
          >
          <div v-else class="detail-nophoto">
            <Icon name="image" size="48" />
            <span>Pas de photo</span>
          </div>
        </div>

        <div class="detail-info">
          <div v-if="isNew || badges.length" class="badges">
            <span v-if="isNew" class="badge badge-new">Nouveau</span>
            <span v-for="badge in badges" :key="badge.id" class="badge" :class="`badge-${badge.style}`">{{ badge.name }}</span>
          </div>
          <p v-if="category" class="category">{{ category }}</p>
          <h1>{{ article.title }}</h1>
          <p class="detail-price">{{ formatPrice(article.price) }}</p>
          <time class="date" :datetime="article.created_at" :title="formatDate(article.created_at)">
            <Icon name="clock" size="14" />Mise en vente {{ timeAgo(article.created_at) }}
          </time>

          <div class="detail-section">
            <h2>Description</h2>
            <p v-if="article.description" class="detail-desc">{{ article.description }}</p>
            <p v-else class="muted">Le vendeur n'a pas ajouté de description.</p>
          </div>

          <div v-if="article.seller_since" class="seller">
            <span class="seller-avatar"><Icon name="user" size="20" /></span>
            <div>
              <p class="seller-name">{{ auth.user?.id === article.user_id ? 'Vendu par vous' : 'Vendu par un collectionneur' }}</p>
              <p class="muted small">Membre depuis {{ formatMonth(article.seller_since) }} · {{ sellerCountText }}</p>
            </div>
          </div>

          <div class="detail-actions">
            <template v-if="editable">
              <button class="btn btn-primary" type="button" @click="openEdit(article)"><Icon name="pencil" />Modifier</button>
              <button class="btn btn-ghost" type="button" @click="onDelete"><Icon name="trash" />Supprimer</button>
            </template>
            <button
              class="btn btn-secondary"
              :class="{ 'is-favorite': article.is_favorite }"
              type="button"
              :aria-pressed="article.is_favorite ? 'true' : 'false'"
              @click="toggleFavorite(article)"
            >
              <Icon name="heart" />{{ article.is_favorite ? 'Dans vos favoris' : 'Ajouter aux favoris' }}
            </button>
            <button class="btn btn-secondary" type="button" @click="copyLink"><Icon name="link" />Copier le lien</button>
          </div>
        </div>
      </article>

      <section v-if="others.length" class="related" aria-labelledby="related-title">
        <h2 id="related-title">Du même vendeur</h2>
        <ul class="grid">
          <ArticleCard v-for="item in others" :key="item.id" :article="item" />
        </ul>
      </section>
    </template>
  </main>
</template>
