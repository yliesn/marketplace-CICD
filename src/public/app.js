const list = document.getElementById('articles');
const count = document.getElementById('count');
const search = document.getElementById('search');
const sort = document.getElementById('sort');

const state = document.getElementById('state');
const stateIcon = document.getElementById('state-icon');
const stateTitle = document.getElementById('state-title');
const stateText = document.getElementById('state-text');
const retry = document.getElementById('retry');

const form = document.getElementById('article-form');
const submit = document.getElementById('submit');
const formError = document.getElementById('form-error');
const descCount = document.getElementById('desc-count');
const toast = document.getElementById('toast');

const priceFormat = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const relativeFormat = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

let articles = [];

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

function normalize(text) {
  return (text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
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

// ---------- Rendering ----------

function renderSkeletons(n = 4) {
  state.hidden = true;
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

  const remove = el('button', 'card-delete', '✕');
  remove.type = 'button';
  remove.title = 'Supprimer';
  remove.setAttribute('aria-label', `Supprimer « ${article.title} »`);
  remove.addEventListener('click', () => deleteArticle(article, li));

  li.append(thumb, title, desc, footer, remove);
  return li;
}

function render() {
  const query = normalize(search.value.trim());
  const visible = articles.filter((a) =>
    !query || normalize(a.title).includes(query) || normalize(a.description).includes(query)
  );

  const sorters = {
    recent: (a, b) => new Date(b.created_at) - new Date(a.created_at) || b.id - a.id,
    'price-asc': (a, b) => Number(a.price) - Number(b.price),
    'price-desc': (a, b) => Number(b.price) - Number(a.price),
  };
  visible.sort(sorters[sort.value]);

  const total = articles.length;
  count.textContent = query
    ? `${visible.length} résultat${visible.length > 1 ? 's' : ''} sur ${total}`
    : `${total} article${total > 1 ? 's' : ''} en vente`;

  list.replaceChildren(...visible.map(renderCard));

  if (total === 0) {
    showState('📦', 'Aucun article pour le moment', 'Soyez le premier à publier une annonce.');
  } else if (visible.length === 0) {
    showState('🔍', 'Aucun résultat', `Aucun article ne correspond à « ${search.value.trim()} ».`);
  } else {
    state.hidden = true;
  }
}

// ---------- API ----------

async function loadArticles() {
  renderSkeletons();
  count.textContent = 'Chargement…';
  try {
    const res = await fetch('/api/articles');
    if (!res.ok) throw new Error(res.statusText);
    articles = await res.json();
    render();
  } catch {
    list.replaceChildren();
    count.textContent = '';
    showState('⚠️', 'Impossible de charger les articles', 'Le serveur ne répond pas.', true);
  }
}

async function deleteArticle(article, card) {
  if (!confirm(`Supprimer « ${article.title} » ?`)) return;

  card.classList.add('is-removing');
  try {
    const res = await fetch(`/api/articles/${article.id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error(res.statusText);
    articles = articles.filter((a) => a.id !== article.id);
    render();
    showToast('Article supprimé');
  } catch {
    card.classList.remove('is-removing');
    showToast('La suppression a échoué');
  }
}

// ---------- Form ----------

function setFieldError(name, message) {
  const input = form.elements[name];
  const error = form.querySelector(`.field-error[data-for="${name}"]`);
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  if (error) error.textContent = message || '';
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

  submit.disabled = true;
  submit.textContent = 'Publication…';

  try {
    const res = await fetch('/api/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title.value,
        description: form.description.value,
        price: Number(form.price.value),
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data.errors || [data.error || 'Erreur lors de la publication']).join(', '));
    }

    articles.unshift(data);
    search.value = '';
    render();
    form.reset();
    descCount.textContent = '0 / 500';
    showToast('Article publié ✓');
    if (window.matchMedia('(max-width: 899px)').matches) {
      list.scrollIntoView({ behavior: 'smooth' });
    }
  } catch (err) {
    formError.textContent = err.message || 'Erreur lors de la publication';
    formError.hidden = false;
  } finally {
    submit.disabled = false;
    submit.textContent = "Publier l'article";
  }
});

form.title.addEventListener('input', () => setFieldError('title', ''));
form.price.addEventListener('input', () => setFieldError('price', ''));
form.description.addEventListener('input', () => {
  descCount.textContent = `${form.description.value.length} / 500`;
});

search.addEventListener('input', render);
sort.addEventListener('change', render);
retry.addEventListener('click', loadArticles);

loadArticles();
