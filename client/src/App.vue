<script setup>
import { ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import ArticleForm from './components/ArticleForm.vue';
import Icon from './components/Icon.vue';
import Logo from './components/Logo.vue';
import { auth } from './auth';
import { closeForm, confirmState, form, onGone, onSaved, openCreate, search, toast } from './ui';

// App.vue est le cadre commun à toutes les pages : en-tête, pied de page et fenêtres partagées.
// Le contenu de la page courante s'affiche à l'emplacement de <RouterView>.

const route = useRoute();
const router = useRouter();

const confirmDialog = ref(null);

// La recherche se fait sur l'accueil : taper depuis une autre page y ramène.
function onSearchInput() {
  if (route.name !== 'home') router.push({ name: 'home' });
}

// ---------- Confirmation de suppression ----------

watch(() => confirmState.open, (open) => {
  if (!open) return;
  confirmDialog.value.returnValue = 'cancel';
  confirmDialog.value.showModal();
});

function onConfirmClose() {
  confirmState.resolve?.(confirmDialog.value.returnValue === 'confirm');
  confirmState.open = false;
  confirmState.resolve = null;
}
</script>

<template>
  <header class="site-header">
    <div class="container header-inner">
      <RouterLink class="home-link" :to="{ name: 'home' }" aria-label="Collector, accueil"><Logo /></RouterLink>

      <template v-if="!route.meta.bare">
        <div class="header-search">
          <label class="visually-hidden" for="search">Rechercher</label>
          <input
            id="search"
            v-model="search"
            class="input search"
            type="search"
            placeholder="Rechercher un objet"
            autocomplete="off"
            @input="onSearchInput"
          >
        </div>
        <div class="header-actions">
          <RouterLink v-if="auth.user" class="btn btn-link small" :to="{ name: 'profile' }" :title="auth.user.email">
            <Icon name="user" /><span>Mon profil</span>
          </RouterLink>
          <RouterLink v-else class="btn btn-link small" :to="{ name: 'login' }"><Icon name="user" />Connexion</RouterLink>
          <button class="btn btn-primary" type="button" @click="openCreate"><Icon name="plus" />Mettre en vente</button>
        </div>
      </template>
    </div>
  </header>

  <!-- L'accueil reste en mémoire : en revenant d'une fiche, on retrouve la liste telle qu'on l'a laissée. -->
  <RouterView v-slot="{ Component }">
    <KeepAlive include="HomePage">
      <component :is="Component" />
    </KeepAlive>
  </RouterView>

  <footer class="site-footer">
    <div class="container footer-inner">
      <span class="footer-brand"><Logo symbol-only height="26" />The Collector.</span>
      <span>Les objets ont une histoire.</span>
    </div>
  </footer>

  <ArticleForm :editing="form.editing" :open="form.open" @saved="onSaved" @cancel="closeForm" @gone="onGone" />

  <dialog ref="confirmDialog" class="dialog" aria-labelledby="confirm-title" @close="onConfirmClose">
    <form method="dialog">
      <h2 id="confirm-title">{{ confirmState.title }}</h2>
      <p class="muted">{{ confirmState.message }}</p>
      <div class="dialog-actions">
        <button class="btn btn-secondary" value="cancel">Annuler</button>
        <button class="btn btn-danger" value="confirm"><Icon name="trash" />Supprimer</button>
      </div>
    </form>
  </dialog>

  <div v-if="toast.visible" class="toast" role="status" aria-live="polite" :data-type="toast.type">
    <Icon :name="toast.type === 'error' ? 'alert' : 'check'" />{{ toast.message }}
  </div>
</template>
