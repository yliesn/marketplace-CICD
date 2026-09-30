import { reactive } from 'vue';

export const auth = reactive({ user: null });

async function send(path, body) {
  const res = await fetch(`/api/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data.errors || [data.error || 'Une erreur est survenue']).join(', '));
  }
  auth.user = data.user;
}

export async function fetchMe() {
  try {
    const res = await fetch('/api/auth/me');
    auth.user = res.ok ? (await res.json()).user : null;
  } catch {
    auth.user = null;
  }
}

export function login(email, password) {
  return send('login', { email, password });
}

export function register(email, password) {
  return send('register', { email, password });
}

export async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  auth.user = null;
}

// Un article est modifiable par son auteur ou par un administrateur.
export function canEdit(article) {
  if (!auth.user) return false;
  return auth.user.role === 'admin' || article.user_id === auth.user.id;
}
