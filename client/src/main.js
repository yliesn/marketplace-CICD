import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { authReady } from './auth';
import '@fontsource-variable/inter';
import './style.css';

authReady();
createApp(App).use(router).mount('#app');
