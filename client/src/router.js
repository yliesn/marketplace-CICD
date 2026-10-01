import { createRouter, createWebHistory } from 'vue-router';
import { auth, authReady } from './auth';
import HomePage from './pages/HomePage.vue';
import ArticlePage from './pages/ArticlePage.vue';
import AuthPage from './pages/AuthPage.vue';
import ProfilePage from './pages/ProfilePage.vue';
import AdminPage from './pages/AdminPage.vue';
import NotFoundPage from './pages/NotFoundPage.vue';

const SITE = 'Collector';

// Une ligne par page : l'adresse, le composant affiché, et quelques réglages dans `meta`.
const routes = [
  { path: '/', name: 'home', component: HomePage },
  { path: '/objet/:id(\\d+)', name: 'article', component: ArticlePage },
  { path: '/profil', name: 'profile', component: ProfilePage, meta: { title: 'Mon profil', requiresAuth: true } },
  { path: '/admin', name: 'admin', component: AdminPage, meta: { title: 'Administration', requiresAuth: true, requiresAdmin: true } },
  { path: '/connexion', name: 'login', component: AuthPage, props: { mode: 'login' }, meta: { title: 'Connexion', guestOnly: true, bare: true } },
  { path: '/inscription', name: 'register', component: AuthPage, props: { mode: 'register' }, meta: { title: 'Créer un compte', guestOnly: true, bare: true } },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundPage, meta: { title: 'Page introuvable' } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  // Retour arrière : on retrouve sa position dans la liste. Sinon, haut de page.
  scrollBehavior: (to, from, saved) => saved || { top: 0 },
});

// Avant chaque changement de page : on protège les pages réservées.
router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth && !to.meta.guestOnly) return true;

  await authReady();
  if (to.meta.requiresAuth && !auth.user) {
    return { name: 'login', query: { suite: to.fullPath } };
  }
  if (to.meta.requiresAdmin && auth.user.role !== 'admin') return { name: 'home' };
  if (to.meta.guestOnly && auth.user) return { name: 'home' };
  return true;
});

router.afterEach((to) => {
  // La fiche d'un objet définit elle-même son titre une fois l'objet chargé.
  if (to.name === 'article') return;
  document.title = to.meta.title ? `${to.meta.title} — ${SITE}` : `${SITE} — Les objets ont une histoire`;
});

export default router;
