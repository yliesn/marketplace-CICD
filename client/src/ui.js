import { reactive, ref } from 'vue';
import { auth } from './auth';
import router from './router';

// État partagé entre les pages : ce qui est affiché par App.vue (notification, formulaire
// de mise en vente, confirmation de suppression) mais déclenché depuis n'importe quelle page.

// ---------- Notification ----------

export const toast = reactive({ message: '', type: 'success', visible: false });

let toastTimer;
export function showToast(message, type = 'success') {
  toast.message = message;
  toast.type = type;
  toast.visible = true;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.visible = false; }, 3000);
}

// ---------- Recherche (champ de l'en-tête) ----------

export const search = ref('');

// ---------- Annonces ----------

// Incrémenté après chaque création, modification ou suppression : les pages qui affichent
// des annonces l'observent pour se recharger.
export const articlesVersion = ref(0);

// Dernier changement, pour que l'accueil revienne sur les plus récentes après une création.
export const lastChange = ref(null); // 'created' | 'updated' | 'deleted'

function changed(kind) {
  lastChange.value = kind;
  articlesVersion.value += 1;
}

// ---------- Formulaire de mise en vente ----------

export const form = reactive({ open: false, editing: null });

let createAfterLogin = false;

export function openCreate() {
  if (!auth.user) {
    createAfterLogin = true;
    router.push({ name: 'login' });
    return;
  }
  form.editing = null;
  form.open = true;
}

export function openEdit(article) {
  form.editing = article;
  form.open = true;
}

export function closeForm() {
  form.open = false;
  form.editing = null;
}

// Appelé après une connexion réussie : reprend la mise en vente demandée avant de se connecter.
export function resumeAfterLogin() {
  if (!createAfterLogin) return false;
  createAfterLogin = false;
  openCreate();
  return true;
}

export function forgetPendingCreate() {
  createAfterLogin = false;
}

export function onSaved({ isEdit, imageSaved }) {
  closeForm();
  const message = isEdit ? 'Annonce modifiée' : 'Annonce publiée';
  if (imageSaved) showToast(message);
  else showToast("Annonce enregistrée, mais la photo n'a pas pu être envoyée", 'error');
  changed(isEdit ? 'updated' : 'created');
}

export function onGone() {
  closeForm();
  showToast("Cette annonce n'existe plus", 'error');
  changed('deleted');
}

// ---------- Suppression ----------

export const confirmState = reactive({ target: null, resolve: null });

function confirmDelete(article) {
  return new Promise((resolve) => {
    confirmState.target = article;
    confirmState.resolve = resolve;
  });
}

export const removingId = ref(null);

// Demande confirmation puis supprime. Retourne true si l'annonce a été supprimée.
export async function deleteArticle(article) {
  if (!(await confirmDelete(article))) return false;

  removingId.value = article.id;
  try {
    const res = await fetch(`/api/articles/${article.id}`, { method: 'DELETE' });
    if (res.status === 401) {
      auth.user = null;
      showToast('Votre session a expiré, reconnectez-vous', 'error');
      return false;
    }
    if (res.status === 403) {
      showToast('Vous ne pouvez pas supprimer cette annonce', 'error');
      return false;
    }
    if (!res.ok && res.status !== 404) throw new Error(res.statusText);
    showToast('Annonce supprimée');
    changed('deleted');
    return true;
  } catch {
    showToast('La suppression a échoué', 'error');
    return false;
  } finally {
    removingId.value = null;
  }
}
