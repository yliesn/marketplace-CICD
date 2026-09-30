const list = document.getElementById('articles');
const count = document.getElementById('count');
const search = document.getElementById('search');
const sort = document.getElementById('sort');
const minPrice = document.getElementById('min-price');
const maxPrice = document.getElementById('max-price');
const resetFilters = document.getElementById('reset-filters');
const filterError = document.getElementById('filter-error');

const pagination = document.getElementById('pagination');
const prevPage = document.getElementById('prev-page');
const nextPage = document.getElementById('next-page');
const pageInfo = document.getElementById('page-info');

const state = document.getElementById('state');
const stateIcon = document.getElementById('state-icon');
const stateTitle = document.getElementById('state-title');
const stateText = document.getElementById('state-text');
const retry = document.getElementById('retry');

const panel = document.getElementById('publish');
const panelTitle = document.getElementById('publish-title');
const panelHint = document.getElementById('publish-hint');
const form = document.getElementById('article-form');
const submit = document.getElementById('submit');
const cancelEdit = document.getElementById('cancel-edit');
const formError = document.getElementById('form-error');
const descCount = document.getElementById('desc-count');
const toast = document.getElementById('toast');

const PER_PAGE = 12;

const priceFormat = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const relativeFormat = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

let articles = [];
let page = 1;
let totalPages = 1;
let total = 0;
let editing = null; // article en cours de modification
let requestId = 0; // ignore les réponses obsolètes

// ---------- Helpers ----------

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function timeAgo(value) {
  const date = new Date(value);
  const seconds = Math.round((date - Date.now()) / 1000);
  const units = [
    ['year', 31536000], ['month', 2592000], ['week', 604800],
    ['day', 86400], ['hour', 3600], ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relativeFormat.format(Math.round(seconds / size), unit);
  }
  return "à l'instant";
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
}

function showState(icon, title, text, withRetry = false) {
  stateIcon.textContent = icon;
  stateTitle.textContent = title;
  stateText.textContent = text;
  retry.hidden = !withRetry;
  state.hidden = false;
}

function hasFilters() {
  return search.value.trim() !== '' || minPrice.value !== '' || maxPrice.value !== '';
}

// ---------- Rendering ----------

function renderSkeletons(n = 4) {
  state.hidden = true;
  pagination.hidden = true;
  list.replaceChildren(...Array.from({ length: n }, () => {
    const li = el('li', 'card skeleton');
    li.setAttribute('aria-hidden', 'true');
    li.append(el('div', 'sk sk-thumb'), el('div', 'sk sk-line'), el('div', 'sk sk-line short'));
    return li;
  }));
}

function renderCard(article) {
  const li = el('li', 'card');
  li.dataset.id = article.id;
  if (editing && editing.id === article.id) li.classList.add('is-editing');

  const initial = (article.title.trim()[0] || '?').toUpperCase();
  const thumb = el('div', 'card-thumb', initial);
  thumb.setAttribute('aria-hidden', 'true');

  const title = el('h3', 'card-title', article.title);
  const desc = el('p', 'card-desc', article.description || '');

  const footer = el('div', 'card-footer');
  const price = el('span', 'price', priceFormat.format(Number(article.price)));
  const date = el('time', 'date', timeAgo(article.created_at));
  date.dateTime = article.created_at;
  date.title = dateFormat.format(new Date(article.created_at));
  footer.append(price, date);

  const actions = el('div', 'card-actions');

  const edit = el('button', 'card-action', '✎');
  edit.type = 'button';
  edit.title = 'Modifier';
  edit.setAttribute('aria-label', `Modifier « ${article.title} »`);
  edit.addEventListener('click', () => startEdit(article));

  const remove = el('button', 'card-action card-delete', '✕');
  remove.type = 'button';
  remove.title = 'Supprimer';
  remove.setAttribute('aria-label', `Supprimer « ${article.title} »`);
  remove.addEventListener('click', () => deleteArticle(article, li));

  actions.append(edit, remove);
  li.append(thumb, title, desc, footer, actions);
  return li;
}

function render() {
  list.replaceChildren(...articles.map(renderCard));

  count.textContent = hasFilters()
    ? `${total} résultat${total > 1 ? 's' : ''}`
    : `${total} article${total > 1 ? 's' : ''} en vente`;

  resetFilters.hidden = !hasFilters();

  if (total === 0 && !hasFilters()) {
    showState('📦', 'Aucun article pour le moment', 'Soyez le premier à publier une annonce.');
  } else if (articles.length === 0) {
    showState('🔍', 'Aucun résultat', 'Aucun article ne correspond à ces critères.');
  } else {
    state.hidden = true;
  }

  pagination.hidden = totalPages <= 1;
  pageInfo.textContent = `Page ${page} / ${totalPages}`;
  prevPage.disabled = page <= 1;
  nextPage.disabled = page >= totalPages;
}

// ---------- API ----------

function buildQuery() {
  const params = new URLSearchParams({ sort: sort.value, page: String(page), limit: String(PER_PAGE) });
  const q = search.value.trim();
  if (q) params.set('q', q);
  if (minPrice.value !== '') params.set('min_price', minPrice.value);
  if (maxPrice.value !== '') params.set('max_price', maxPrice.value);
  return params;
}

function validateFilters() {
  const min = minPrice.value === '' ? null : Number(minPrice.value);
  const max = maxPrice.value === '' ? null : Number(maxPrice.value);
  let message = '';
  if ((min !== null && min < 0) || (max !== null && max < 0)) {
    message = 'Les prix doivent être positifs.';
  } else if (min !== null && max !== null && min > max) {
    message = 'Le prix minimum doit être inférieur au prix maximum.';
  }
  filterError.textContent = message;
  minPrice.setAttribute('aria-invalid', message ? 'true' : 'false');
  maxPrice.setAttribute('aria-invalid', message ? 'true' : 'false');
  return !message;
}

async function loadArticles({ skeleton = true } = {}) {
  if (!validateFilters()) return;

  const current = ++requestId;
  if (skeleton) renderSkeletons();
  count.textContent = 'Chargement…';

  try {
    const res = await fetch(`/api/articles?${buildQuery()}`);
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    if (current !== requestId) return;

    total = Number(res.headers.get('X-Total-Count')) || 0;
    totalPages = Number(res.headers.get('X-Total-Pages')) || 1;

    // Page devenue vide (ex. après une suppression) : on recule d'une page.
    if (data.length === 0 && page > 1) {
      page = Math.min(page - 1, totalPages);
      return loadArticles({ skeleton: false });
    }

    articles = data;
    render();
  } catch {
    if (current !== requestId) return;
    list.replaceChildren();
    pagination.hidden = true;
    count.textContent = '';
    showState('⚠️', 'Impossible de charger les articles', 'Le serveur ne répond pas.', true);
  }
}

function reloadFromFirstPage() {
  page = 1;
  loadArticles();
}

async function deleteArticle(article, card) {
  if (!confirm(`Supprimer « ${article.title} » ?`)) return;

  card.classList.add('is-removing');
  try {
    const res = await fetch(`/api/articles/${article.id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error(res.statusText);
    if (editing && editing.id === article.id) stopEdit();
    showToast('Article supprimé');
    await loadArticles({ skeleton: false });
  } catch {
    card.classList.remove('is-removing');
    showToast('La suppression a échoué');
  }
}

// ---------- Form (création / modification) ----------

function setFieldError(name, message) {
  const input = form.elements[name];
  const error = form.querySelector(`.field-error[data-for="${name}"]`);
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  if (error) error.textContent = message || '';
}

function clearFormErrors() {
  setFieldError('title', '');
  setFieldError('price', '');
  formError.hidden = true;
}

function updateDescCount() {
  descCount.textContent = `${form.description.value.length} / 500`;
}

function startEdit(article) {
  editing = article;
  clearFormErrors();
  form.title.value = article.title;
  form.description.value = article.description || '';
  form.price.value = Number(article.price);
  updateDescCount();

  panel.classList.add('is-editing');
  panelTitle.textContent = "Modifier l'article";
  panelHint.textContent = 'Les modifications sont visibles immédiatement.';
  submit.textContent = 'Enregistrer';
  cancelEdit.hidden = false;

  list.querySelectorAll('.card.is-editing').forEach((c) => c.classList.remove('is-editing'));
  list.querySelector(`.card[data-id="${article.id}"]`)?.classList.add('is-editing');

  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  form.title.focus({ preventScroll: true });
}

function stopEdit() {
  editing = null;
  form.reset();
  clearFormErrors();
  updateDescCount();

  panel.classList.remove('is-editing');
  panelTitle.textContent = 'Publier un article';
  panelHint.textContent = 'Il sera visible immédiatement par tout le monde.';
  submit.textContent = "Publier l'article";
  cancelEdit.hidden = true;
  list.querySelectorAll('.card.is-editing').forEach((c) => c.classList.remove('is-editing'));
}

function validate() {
  let ok = true;
  const title = form.title.value.trim();
  const price = form.price.value;

  setFieldError('title', title ? '' : 'Le titre est obligatoire.');
  if (!title) ok = false;

  if (price === '') {
    setFieldError('price', 'Le prix est obligatoire.');
    ok = false;
  } else if (Number(price) < 0 || !Number.isFinite(Number(price))) {
    setFieldError('price', 'Le prix doit être un nombre positif.');
    ok = false;
  } else {
    setFieldError('price', '');
  }
  return ok;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  formError.hidden = true;
  if (!validate()) {
    form.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  const isEdit = editing !== null;
  const label = submit.textContent;
  submit.disabled = true;
  submit.textContent = isEdit ? 'Enregistrement…' : 'Publication…';

  try {
    const res = await fetch(isEdit ? `/api/articles/${editing.id}` : '/api/articles', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title.value,
        description: form.description.value,
        price: Number(form.price.value),
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.status === 404 && isEdit) {
      stopEdit();
      await loadArticles({ skeleton: false });
      throw new Error("Cet article n'existe plus.");
    }
    if (!res.ok) {
      throw new Error((data.errors || [data.error || 'Erreur lors de l\'enregistrement']).join(', '));
    }

    if (isEdit) {
      stopEdit();
      showToast('Article modifié ✓');
      await loadArticles({ skeleton: false });
    } else {
      form.reset();
      updateDescCount();
      showToast('Article publié ✓');
      // On revient sur la vue « plus récents » sans filtre pour voir le nouvel article.
      search.value = '';
      minPrice.value = '';
      maxPrice.value = '';
      sort.value = 'recent';
      reloadFromFirstPage();
      if (window.matchMedia('(max-width: 899px)').matches) {
        list.scrollIntoView({ behavior: 'smooth' });
      }
    }
  } catch (err) {
    formError.textContent = err.message || "Erreur lors de l'enregistrement";
    formError.hidden = false;
  } finally {
    submit.disabled = false;
    if (submit.textContent.endsWith('…')) submit.textContent = label;
  }
});

cancelEdit.addEventListener('click', stopEdit);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && editing) stopEdit();
});

form.title.addEventListener('input', () => setFieldError('title', ''));
form.price.addEventListener('input', () => setFieldError('price', ''));
form.description.addEventListener('input', updateDescCount);

// ---------- Filtres & pagination ----------

const debouncedReload = debounce(reloadFromFirstPage, 300);
search.addEventListener('input', debouncedReload);
minPrice.addEventListener('input', debouncedReload);
maxPrice.addEventListener('input', debouncedReload);
sort.addEventListener('change', reloadFromFirstPage);

resetFilters.addEventListener('click', () => {
  search.value = '';
  minPrice.value = '';
  maxPrice.value = '';
  reloadFromFirstPage();
});

function goToPage(target) {
  page = target;
  loadArticles();
  list.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
prevPage.addEventListener('click', () => page > 1 && goToPage(page - 1));
nextPage.addEventListener('click', () => page < totalPages && goToPage(page + 1));

retry.addEventListener('click', () => loadArticles());

loadArticles();
