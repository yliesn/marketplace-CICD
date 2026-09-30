<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import ArticleCard from '../components/ArticleCard.vue';
import Icon from '../components/Icon.vue';
import { canEdit } from '../auth';
import { debounce } from '../format';
import { articlesVersion, deleteArticle, lastChange, openCreate, openEdit, removingId, search } from '../ui';

const PER_PAGE = 12;
const SKELETONS = 6;

const articles = ref([]);
const page = ref(1);
const totalPages = ref(1);
const total = ref(0);
const loading = ref(true);
const skeleton = ref(true);
const failed = ref(false);
const filtered = ref(false); // des filtres étaient actifs lors du dernier chargement

// La recherche vient du champ de l'en-tête (voir ui.js).
const filters = reactive({ sort: 'recent', min: '', max: '' });

let requestId = 0; // ignore les réponses obsolètes

const hasFilters = computed(() => search.value.trim() !== '' || filters.min !== '' || filters.max !== '');

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
    return { icon: 'alert', title: 'Impossible de charger les annonces', text: 'Le serveur ne répond pas.', action: 'retry' };
  }
  if (total.value === 0 && !filtered.value) {
    return { icon: 'package', title: 'Aucune annonce pour le moment', text: 'Vous avez un objet qui dort dans un placard ? Il mérite peut-être une nouvelle collection.', action: 'create' };
  }
  if (articles.value.length === 0) {
    return { icon: 'search', title: 'Aucun résultat', text: 'Aucun objet ne correspond à cette recherche. Essayez avec d\'autres mots ou un autre prix.', action: 'reset' };
  }
  return null;
});

const showPagination = computed(() => !skeleton.value && !failed.value && totalPages.value > 1);

function buildQuery() {
  const params = new URLSearchParams({ sort: filters.sort, page: String(page.value), limit: String(PER_PAGE) });
  const q = search.value.trim();
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

watch(search, debouncedReload);

function onSortChange(event) {
  filters.sort = event.target.value;
  reloadFromFirstPage();
}

function resetFilters() {
  search.value = '';
  filters.min = '';
  filters.max = '';
  reloadFromFirstPage();
}

function goToPage(target) {
  page.value = target;
  loadArticles();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Une annonce a été créée, modifiée ou supprimée (ici ou sur une autre page).
watch(articlesVersion, () => {
  if (lastChange.value === 'created') {
    // On revient sur les plus récentes, sans filtre, pour voir la nouvelle annonce.
    filters.sort = 'recent';
    resetFilters();
    return;
  }
  loadArticles({ withSkeleton: false });
});

onMounted(() => loadArticles());
</script>

<template>
  <div>
    <section class="hero">
      <div class="container hero-inner">
        <div class="hero-text">
          <h1>Retrouvez les objets qui ont marqué votre époque.</h1>
          <p>Figurines, consoles rétro, cartes, affiches : achetez et vendez des objets de collection entre passionnés.</p>
          <button class="btn btn-primary" type="button" @click="openCreate"><Icon name="plus" />Mettre en vente</button>
        </div>
        <div class="hero-art" aria-hidden="true">
          <svg viewBox="3 11 106 68">
            <path d="M20 15H75L105 45L75 75H20C12 75 7 70 7 62V28C7 20 12 15 20 15Z" fill="#FFFFFF" stroke="#20252B" stroke-width="3" stroke-linejoin="round" />
            <circle cx="24" cy="45" r="6" fill="#E85D3F" stroke="#20252B" stroke-width="2.5" />
            <path d="M62 27L67 39L80 40L70 48L73 61L62 54L51 61L54 48L44 40L57 39Z" fill="#E85D3F" />
          </svg>
        </div>
      </div>
    </section>

    <main class="container page" aria-labelledby="listing-title">
      <div class="page-head">
        <h2 id="listing-title">Les dernières trouvailles</h2>
        <p class="muted">{{ countText }}</p>
      </div>

      <div class="toolbar">
        <div class="toolbar-group" role="group" aria-label="Filtrer par prix">
          <span class="toolbar-label"><Icon name="sliders" />Prix</span>
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
          <button v-if="hasFilters" class="btn btn-link small" type="button" @click="resetFilters"><Icon name="x" size="14" />Effacer les filtres</button>
        </div>

        <div class="toolbar-group">
          <label class="toolbar-label" for="sort"><Icon name="sort" />Trier par</label>
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
        <span class="state-icon"><Icon :name="emptyState.icon" size="26" /></span>
        <p class="state-title">{{ emptyState.title }}</p>
        <p class="muted">{{ emptyState.text }}</p>
        <button v-if="emptyState.action === 'retry'" class="btn btn-ghost" type="button" @click="loadArticles()">Réessayer</button>
        <button v-else-if="emptyState.action === 'create'" class="btn btn-primary" type="button" @click="openCreate"><Icon name="plus" />Mettre en vente</button>
        <button v-else class="btn btn-secondary" type="button" @click="resetFilters"><Icon name="x" />Effacer les filtres</button>
      </div>

      <nav v-if="showPagination" class="pagination" aria-label="Pagination">
        <button class="btn btn-ghost btn-sm" type="button" :disabled="page <= 1" @click="goToPage(page - 1)"><Icon name="chevron-left" />Précédent</button>
        <span class="muted small">Page {{ page }} sur {{ totalPages }}</span>
        <button class="btn btn-ghost btn-sm" type="button" :disabled="page >= totalPages" @click="goToPage(page + 1)">Suivant<Icon name="chevron-right" /></button>
      </nav>
    </main>
  </div>
</template>
