import { reactive } from 'vue';

// Catégories et badges créés par les administrateurs : chargés au démarrage, partagés par toutes les pages.
export const catalog = reactive({ categories: [], badges: [] });

async function fetchList(path) {
  const res = await fetch(`/api/${path}`);
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

export async function loadCatalog() {
  try {
    [catalog.categories, catalog.badges] = await Promise.all([fetchList('categories'), fetchList('badges')]);
  } catch {
    // Sans catalogue, les annonces restent consultables : seuls les filtres et badges manquent.
  }
}

export function categoryName(article) {
  return catalog.categories.find((category) => category.id === article.category_id)?.name || '';
}

export function badgesOf(article) {
  const ids = article.badge_ids || [];
  return catalog.badges.filter((badge) => ids.includes(badge.id));
}
