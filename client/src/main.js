import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { authReady } from './auth';
import { loadCatalog } from './catalog';
import '@fontsource-variable/inter';
import './style.css';

authReady();
loadCatalog();
createApp(App).use(router).mount('#app');
