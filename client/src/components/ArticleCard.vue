<script setup>
import { computed, ref, watch } from 'vue';
import { formatDate, formatPrice, hueFor, imageUrl, timeAgo } from '../format';

const NEW_BADGE_MS = 24 * 60 * 60 * 1000;

const props = defineProps({
  article: { type: Object, required: true },
  editing: Boolean,
  removing: Boolean,
});

defineEmits(['edit', 'delete']);

const imageFailed = ref(false);
watch(() => props.article.image_updated_at, () => { imageFailed.value = false; });

const initial = computed(() => (props.article.title.trim()[0] || '?').toUpperCase());
const hasImage = computed(() => Boolean(props.article.image_updated_at));
const isNew = computed(() => Date.now() - new Date(props.article.created_at) < NEW_BADGE_MS);
</script>

<template>
  <li class="card" :class="{ 'is-editing': editing, 'is-removing': removing }">
    <div
      class="card-thumb"
      :style="{ '--hue': hueFor(article.title) }"
      :aria-hidden="hasImage ? null : 'true'"
    >
      <img
        v-if="hasImage && !imageFailed"
        :src="imageUrl(article)"
        :alt="`Photo de « ${article.title} »`"
        loading="lazy"
        @error="imageFailed = true"
      >
      <template v-else>{{ initial }}</template>
      <span v-if="isNew" class="badge">Nouveau</span>
    </div>

    <h3 class="card-title">{{ article.title }}</h3>
    <p class="card-desc">{{ article.description || '' }}</p>

    <div class="card-footer">
      <span class="price">{{ formatPrice(article.price) }}</span>
      <time class="date" :datetime="article.created_at" :title="formatDate(article.created_at)">
        {{ timeAgo(article.created_at) }}
      </time>
    </div>

    <div class="card-actions">
      <button
        class="card-action"
        type="button"
        title="Modifier"
        :aria-label="`Modifier « ${article.title} »`"
        @click="$emit('edit', article)"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>
      <button
        class="card-action card-delete"
        type="button"
        title="Supprimer"
        :aria-label="`Supprimer « ${article.title} »`"
        @click="$emit('delete', article)"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" />
        </svg>
      </button>
    </div>
  </li>
</template>
