<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import ArticleCard from './components/ArticleCard.vue';
import ArticleForm from './components/ArticleForm.vue';
import AuthDialog from './components/AuthDialog.vue';
import { auth, canEdit, fetchMe, logout } from './auth';
import { debounce } from './format';

const PER_PAGE = 12;
const SKELETONS = 6;

const confirmDialog = ref(null);

const articles = ref([]);
const page = ref(1);
const totalPages = ref(1);
const total = ref(0);
const loading = ref(true);
const skeleton = ref(true);
const failed = ref(false);
const filtered = ref(false); // des filtres étaient actifs lors du dernier chargement
const editing = ref(null); // article en cours de modification
const formOpen = ref(false);
const authOpen = ref(false);
const createAfterAuth = ref(false); // ouvrir le formulaire de dépôt une fois connecté
const removingId = ref(null);
const confirmTarget = ref(null);
const toast = reactive({ message: '', type: 'success', visible: false });

const filters = reactive({ q: '', sort: 'recent', min: '', max: '' });

let requestId = 0; // ignore les réponses obsolètes

const hasFilters = computed(() => filters.q.trim() !== '' || filters.min !== '' || filters.max !== '');

const filterError = computed(() => {
  const min = filters.min === '' ? null : Number(filters.min);
  const max = filters.max === '' ? null : Number(filters.max);
  if ((min !== null && min < 0) || (max !== null && max < 0)) return 'Les prix doivent être positifs.';
  if (min !== null && max !== null && min > max) return 'Le prix minimum doit être inférieur au prix maximum.';
  return '';
});

const countText = computed(() => {
  if (loading.value) return 'Chargement…';
  if (failed.value) return '';
  const plural = total.value > 1 ? 's' : '';
  return filtered.value ? `${total.value} résultat${plural}` : `${total.value} annonce${plural}`;
});

const emptyState = computed(() => {
  if (skeleton.value) return null;
  if (failed.value) {
    return { title: 'Impossible de charger les annonces', text: 'Le serveur ne répond pas.', action: 'retry' };
  }
  if (total.value === 0 && !filtered.value) {
    return { title: 'Aucune annonce pour le moment', text: 'Soyez le premier à en déposer une.', action: 'create' };
  }
  if (articles.value.length === 0) {
    return { title: 'Aucun résultat', text: 'Aucune annonce ne correspond à ces critères.', action: 'reset' };
  }
  return null;
});

const showPagination = computed(() => !skeleton.value && !failed.value && totalPages.value > 1);

// ---------- Toast ----------

let toastTimer;
function showToast(message, type = 'success') {
  toast.message = message;
  toast.type = type;
  toast.visible = true;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.visible = false; }, 3000);
}

// ---------- API ----------

function buildQuery() {
  const params = new URLSearchParams({ sort: filters.sort, page: String(page.value), limit: String(PER_PAGE) });
  const q = filters.q.trim();
  if (q) params.set('q', q);
  if (filters.min !== '') params.set('min_price', filters.min);
  if (filters.max !== '') params.set('max_price', filters.max);
  return params;
}

async function loadArticles({ withSkeleton = true } = {}) {
  if (filterError.value) return;

  const current = ++requestId;
  if (withSkeleton) {
    skeleton.value = true;
    failed.value = false;
  }
  loading.value = true;

  try {
    const res = await fetch(`/api/articles?${buildQuery()}`);
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    if (current !== requestId) return;

    total.value = Number(res.headers.get('X-Total-Count')) || 0;
    totalPages.value = Number(res.headers.get('X-Total-Pages')) || 1;

    // Page devenue vide (ex. après une suppression) : on recule d'une page.
    if (data.length === 0 && page.value > 1) {
      page.value = Math.min(page.value - 1, totalPages.value);
      return loadArticles({ withSkeleton: false });
    }

    articles.value = data;
    filtered.value = hasFilters.value;
    failed.value = false;
  } catch {
    if (current !== requestId) return;
    articles.value = [];
    failed.value = true;
  }
  skeleton.value = false;
  loading.value = false;
}

function reloadFromFirstPage() {
  page.value = 1;
  loadArticles();
}

const debouncedReload = debounce(reloadFromFirstPage, 300);

function onSortChange(event) {
  filters.sort = event.target.value;
  reloadFromFirstPage();
}

function resetFilters() {
  filters.q = '';
  filters.min = '';
  filters.max = '';
  reloadFromFirstPage();
}

function goToPage(target) {
  page.value = target;
  loadArticles();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- Suppression ----------

function confirmDelete(article) {
  const dialog = confirmDialog.value;
  confirmTarget.value = article;
  dialog.returnValue = 'cancel';
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
  });
}

async function deleteArticle(article) {
  if (!(await confirmDelete(article))) return;

  removingId.value = article.id;
  try {
    const res = await fetch(`/api/articles/${article.id}`, { method: 'DELETE' });
    if (res.status === 401) {
      auth.user = null;
      showToast('Votre session a expiré, reconnectez-vous', 'error');
      return;
    }
    if (res.status === 403) {
      showToast("Vous ne pouvez pas supprimer cette annonce", 'error');
      return;
    }
    if (!res.ok && res.status !== 404) throw new Error(res.statusText);
    showToast('Annonce supprimée');
    await loadArticles({ withSkeleton: false });
  } catch {
    showToast('La suppression a échoué', 'error');
  } finally {
    removingId.value = null;
  }
}

// ---------- Formulaire ----------

function openCreate() {
  if (!auth.user) {
    createAfterAuth.value = true;
    authOpen.value = true;
    return;
  }
  editing.value = null;
  formOpen.value = true;
}

function openEdit(article) {
  editing.value = article;
  formOpen.value = true;
}

function closeForm() {
  formOpen.value = false;
  editing.value = null;
}

function onSaved({ isEdit, imageSaved }) {
  const notify = (message) => (imageSaved
    ? showToast(message)
    : showToast("Annonce enregistrée, mais la photo n'a pas pu être envoyée", 'error'));

  closeForm();

  if (isEdit) {
    notify('Annonce modifiée');
    loadArticles({ withSkeleton: false });
    return;
  }

  notify('Annonce publiée');
  // On revient sur la vue « plus récentes » sans filtre pour voir la nouvelle annonce.
  filters.sort = 'recent';
  resetFilters();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function onGone() {
  closeForm();
  showToast("Cette annonce n'existe plus", 'error');
  loadArticles({ withSkeleton: false });
}

// ---------- Authentification ----------

function openAuth() {
  createAfterAuth.value = false;
  authOpen.value = true;
}

function closeAuth() {
  authOpen.value = false;
  createAfterAuth.value = false;
}

function onAuthDone({ registered }) {
  const create = createAfterAuth.value;
  closeAuth();
  showToast(registered ? 'Compte créé' : 'Connexion réussie');
  if (create) openCreate();
}

async function onLogout() {
  await logout();
  closeForm();
  showToast('Vous êtes déconnecté');
}

onMounted(() => {
  fetchMe();
  loadArticles();
});

onBeforeUnmount(() => clearTimeout(toastTimer));
</script>

<template>
  <header class="site-header">
    <div class="container header-inner">
      <a class="wordmark" href="/">Marketplace Simulator</a>
      <div class="header-search">
        <label class="visually-hidden" for="search">Rechercher</label>
        <input
          id="search"
          v-model="filters.q"
          class="input search"
          type="search"
          placeholder="Rechercher une annonce"
          autocomplete="off"
          @input="debouncedReload"
        >
      </div>
      <div class="header-actions">
        <template v-if="auth.user">
          <span class="header-user muted small" :title="auth.user.email">
            {{ auth.user.email }}{{ auth.user.role === 'admin' ? ' (admin)' : '' }}
          </span>
          <button class="btn btn-link small" type="button" @click="onLogout">Déconnexion</button>
        </template>
        <button v-else class="btn btn-link small" type="button" @click="openAuth">Connexion</button>
        <button class="btn btn-primary" type="button" @click="openCreate">Déposer une annonce</button>
      </div>
    </div>
  </header>

  <main class="container page" aria-labelledby="listing-title">
    <div class="page-head">
      <h1 id="listing-title">Annonces</h1>
      <p class="muted">{{ countText }}</p>
    </div>

    <div class="toolbar">
      <div class="toolbar-group" role="group" aria-label="Filtrer par prix">
        <span class="toolbar-label">Prix</span>
        <label class="visually-hidden" for="min-price">Prix minimum</label>
        <div class="input-suffix">
          <input
            id="min-price"
            v-model="filters.min"
            class="input"
            type="number"
            min="0"
            step="1"
            inputmode="decimal"
            placeholder="Min"
            :aria-invalid="filterError ? 'true' : 'false'"
            @input="debouncedReload"
          >
          <span aria-hidden="true">€</span>
        </div>
        <span class="muted" aria-hidden="true">à</span>
        <label class="visually-hidden" for="max-price">Prix maximum</label>
        <div class="input-suffix">
          <input
            id="max-price"
            v-model="filters.max"
            class="input"
            type="number"
            min="0"
            step="1"
            inputmode="decimal"
            placeholder="Max"
            :aria-invalid="filterError ? 'true' : 'false'"
            @input="debouncedReload"
          >
          <span aria-hidden="true">€</span>
        </div>
        <button v-if="hasFilters" class="btn btn-link small" type="button" @click="resetFilters">Effacer les filtres</button>
      </div>

      <div class="toolbar-group">
        <label class="toolbar-label" for="sort">Trier par</label>
        <select id="sort" class="input" :value="filters.sort" @change="onSortChange">
          <option value="recent">Plus récentes</option>
          <option value="price-asc">Prix croissant</option>
          <option value="price-desc">Prix décroissant</option>
        </select>
      </div>
    </div>
    <p class="field-error" role="alert">{{ filterError }}</p>

    <ul class="grid" aria-live="polite">
      <template v-if="skeleton">
        <li v-for="n in SKELETONS" :key="`skeleton-${n}`" class="card skeleton" aria-hidden="true">
          <div class="sk sk-thumb" />
          <div class="sk sk-line" />
          <div class="sk sk-line short" />
        </li>
      </template>
      <template v-else>
        <ArticleCard
          v-for="article in articles"
          :key="article.id"
          :article="article"
          :removing="removingId === article.id"
          :can-edit="canEdit(article)"
          @edit="openEdit"
          @delete="deleteArticle"
        />
      </template>
    </ul>

    <div v-if="emptyState" class="state">
      <p class="state-title">{{ emptyState.title }}</p>
      <p class="muted">{{ emptyState.text }}</p>
      <button v-if="emptyState.action === 'retry'" class="btn btn-ghost" type="button" @click="loadArticles()">Réessayer</button>
      <button v-else-if="emptyState.action === 'create'" class="btn btn-primary" type="button" @click="openCreate">Déposer une annonce</button>
      <button v-else class="btn btn-ghost" type="button" @click="resetFilters">Effacer les filtres</button>
    </div>

    <nav v-if="showPagination" class="pagination" aria-label="Pagination">
      <button class="btn btn-ghost btn-sm" type="button" :disabled="page <= 1" @click="goToPage(page - 1)">Précédent</button>
      <span class="muted small">Page {{ page }} sur {{ totalPages }}</span>
      <button class="btn btn-ghost btn-sm" type="button" :disabled="page >= totalPages" @click="goToPage(page + 1)">Suivant</button>
    </nav>
  </main>

  <ArticleForm :editing="editing" :open="formOpen" @saved="onSaved" @cancel="closeForm" @gone="onGone" />

  <AuthDialog :open="authOpen" @done="onAuthDone" @cancel="closeAuth" />

  <dialog ref="confirmDialog" class="dialog" aria-labelledby="confirm-title">
    <form method="dialog">
      <h2 id="confirm-title">Supprimer cette annonce ?</h2>
      <p class="muted">{{ confirmTarget ? `« ${confirmTarget.title} » sera définitivement supprimée.` : '' }}</p>
      <div class="dialog-actions">
        <button class="btn btn-ghost" value="cancel">Annuler</button>
        <button class="btn btn-danger" value="confirm">Supprimer</button>
      </div>
    </form>
  </dialog>

  <div v-if="toast.visible" class="toast" role="status" aria-live="polite" :data-type="toast.type">{{ toast.message }}</div>
</template>
