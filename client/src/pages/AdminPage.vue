<script setup>
import { onMounted, reactive, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import Icon from '../components/Icon.vue';
import { auth } from '../auth';
import { catalog, loadCatalog } from '../catalog';
import { formatMonth } from '../format';
import { confirmDelete, showToast } from '../ui';

const BADGE_STYLES = [
  { value: 'accent', label: 'Rouge' },
  { value: 'cream', label: 'Crème' },
];

const router = useRouter();

const users = ref([]);
const usersStatus = ref('loading'); // 'loading' | 'ready' | 'error'
const newCategory = ref('');
const newBadge = reactive({ name: '', style: 'accent' });
const busy = ref(false);

// Droits retirés ou déconnexion pendant que la page est affichée : elle n'a plus lieu d'être.
watch(() => auth.user, (user) => { if (user?.role !== 'admin') router.push({ name: 'home' }); });

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) auth.user = null;
  if (!res.ok) throw new Error((data.errors || [data.error || 'Une erreur est survenue']).join(', '));
  return data;
}

// Exécute une modification, recharge le catalogue et affiche le résultat.
async function run(action, success) {
  busy.value = true;
  try {
    await action();
    showToast(success);
    return true;
  } catch (err) {
    showToast(err.message, 'error');
    return false;
  } finally {
    busy.value = false;
  }
}

async function addCategory() {
  const name = newCategory.value.trim();
  if (!name) return;
  const done = await run(async () => {
    await api('categories', { method: 'POST', body: { name } });
    await loadCatalog();
  }, `Catégorie « ${name} » ajoutée`);
  if (done) newCategory.value = '';
}

async function removeCategory(category) {
  const confirmed = await confirmDelete(
    'Supprimer cette catégorie ?',
    `Les annonces classées dans « ${category.name} » resteront en ligne, sans catégorie.`
  );
  if (!confirmed) return;
  await run(async () => {
    await api(`categories/${category.id}`, { method: 'DELETE' });
    await loadCatalog();
  }, 'Catégorie supprimée');
}

async function addBadge() {
  const name = newBadge.name.trim();
  if (!name) return;
  const done = await run(async () => {
    await api('badges', { method: 'POST', body: { name, style: newBadge.style } });
    await loadCatalog();
  }, `Badge « ${name} » ajouté`);
  if (done) newBadge.name = '';
}

async function removeBadge(badge) {
  const confirmed = await confirmDelete(
    'Supprimer ce badge ?',
    `Le badge « ${badge.name} » sera retiré de toutes les annonces.`
  );
  if (!confirmed) return;
  await run(async () => {
    await api(`badges/${badge.id}`, { method: 'DELETE' });
    await loadCatalog();
  }, 'Badge supprimé');
}

async function loadUsers() {
  usersStatus.value = 'loading';
  try {
    users.value = await api('admin/users');
    usersStatus.value = 'ready';
  } catch {
    usersStatus.value = 'error';
  }
}

async function setRole(user, role) {
  await run(async () => {
    const updated = await api(`admin/users/${user.id}/role`, { method: 'PUT', body: { role } });
    user.role = updated.role;
  }, role === 'admin' ? `${user.email} est maintenant administrateur` : `${user.email} n'est plus administrateur`);
}

onMounted(() => {
  loadCatalog();
  loadUsers();
});
</script>

<template>
  <main v-if="auth.user" class="container page admin">
    <RouterLink class="btn btn-link small" :to="{ name: 'profile' }"><Icon name="chevron-left" />Retour au profil</RouterLink>
    <h1 class="admin-title">Administration</h1>

    <section class="admin-section" aria-labelledby="categories-title">
      <h2 id="categories-title">Catégories</h2>
      <p class="muted">Les vendeurs en choisissent une en publiant leur annonce ; l'accueil permet de filtrer par catégorie.</p>
      <ul v-if="catalog.categories.length" class="chips">
        <li v-for="category in catalog.categories" :key="category.id" class="chip">
          {{ category.name }}
          <button class="chip-remove" type="button" :disabled="busy" :aria-label="`Supprimer la catégorie ${category.name}`" title="Supprimer" @click="removeCategory(category)">
            <Icon name="x" size="14" />
          </button>
        </li>
      </ul>
      <p v-else class="muted small">Aucune catégorie pour le moment.</p>
      <form class="inline-form" @submit.prevent="addCategory">
        <label class="visually-hidden" for="new-category">Nom de la nouvelle catégorie</label>
        <input id="new-category" v-model="newCategory" class="input" maxlength="40" placeholder="Ex. Consoles rétro" required>
        <button class="btn btn-secondary" type="submit" :disabled="busy"><Icon name="plus" />Ajouter</button>
      </form>
    </section>

    <section class="admin-section" aria-labelledby="badges-title">
      <h2 id="badges-title">Badges</h2>
      <p class="muted">Les vendeurs peuvent les ajouter à leurs annonces. Gardez-les courts.</p>
      <ul v-if="catalog.badges.length" class="chips">
        <li v-for="badge in catalog.badges" :key="badge.id" class="chip">
          <span class="badge" :class="`badge-${badge.style}`">{{ badge.name }}</span>
          <button class="chip-remove" type="button" :disabled="busy" :aria-label="`Supprimer le badge ${badge.name}`" title="Supprimer" @click="removeBadge(badge)">
            <Icon name="x" size="14" />
          </button>
        </li>
      </ul>
      <p v-else class="muted small">Aucun badge pour le moment.</p>
      <form class="inline-form" @submit.prevent="addBadge">
        <label class="visually-hidden" for="new-badge">Nom du nouveau badge</label>
        <input id="new-badge" v-model="newBadge.name" class="input" maxlength="40" placeholder="Ex. Édition limitée" required>
        <label class="visually-hidden" for="new-badge-style">Couleur du badge</label>
        <select id="new-badge-style" v-model="newBadge.style" class="input">
          <option v-for="style in BADGE_STYLES" :key="style.value" :value="style.value">{{ style.label }}</option>
        </select>
        <button class="btn btn-secondary" type="submit" :disabled="busy"><Icon name="plus" />Ajouter</button>
      </form>
    </section>

    <section class="admin-section" aria-labelledby="users-title">
      <h2 id="users-title">Utilisateurs</h2>
      <p class="muted">Un administrateur a tous les droits sur les annonces, les catégories et les badges.</p>

      <p v-if="usersStatus === 'loading'" class="muted small">Chargement…</p>
      <div v-else-if="usersStatus === 'error'" class="alert admin-error">
        Impossible de charger les utilisateurs.
        <button class="btn btn-link small" type="button" @click="loadUsers">Réessayer</button>
      </div>
      <ul v-else class="user-list">
        <li v-for="member in users" :key="member.id">
          <div class="user-identity">
            <p class="user-email">
              {{ member.email }}
              <span v-if="member.role === 'admin'" class="badge badge-new">Administrateur</span>
            </p>
            <p class="muted small">Membre depuis {{ formatMonth(member.created_at) }}</p>
          </div>
          <span v-if="member.id === auth.user.id" class="muted small">Vous</span>
          <button v-else-if="member.role === 'admin'" class="btn btn-ghost btn-sm" type="button" :disabled="busy" @click="setRole(member, 'user')">
            Retirer les droits
          </button>
          <button v-else class="btn btn-secondary btn-sm" type="button" :disabled="busy" @click="setRole(member, 'admin')">
            <Icon name="shield" />Nommer administrateur
          </button>
        </li>
      </ul>
    </section>
  </main>
</template>
