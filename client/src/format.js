const priceFormat = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const relativeFormat = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

export function formatPrice(value) {
  return priceFormat.format(Number(value));
}

export function formatDate(value) {
  return dateFormat.format(new Date(value));
}

export function timeAgo(value) {
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

export function imageUrl(article) {
  return `/api/articles/${article.id}/image?v=${Date.parse(article.image_updated_at)}`;
}

export function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
