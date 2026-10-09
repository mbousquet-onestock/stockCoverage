<script setup lang="ts">
import type { Suggestion } from '../api';

/** Drop-down list of suggestions under a field (positioned by the parent, which is `position: relative`). */
defineProps<{
  id: string;
  suggestions: Suggestion[];
  active: number;
  loading: boolean;
  error: string;
  loadingText?: string;
  emptyText?: string;
}>();
const emit = defineEmits<{ pick: [suggestion: Suggestion]; hover: [index: number] }>();
</script>

<template>
  <ul :id="id" class="suggestions" role="listbox">
    <li v-if="loading" class="info os-body-s">{{ loadingText ?? '…' }}</li>
    <li v-else-if="error" class="info error os-body-s">{{ error }}</li>
    <li v-else-if="!suggestions.length" class="info os-body-s">{{ emptyText }}</li>
    <li
      v-for="(suggestion, i) in loading ? [] : suggestions"
      :key="suggestion.id"
      role="option"
      :aria-selected="i === active"
      :class="{ active: i === active }"
      @mousedown.prevent="emit('pick', suggestion)"
      @mouseenter="emit('hover', i)"
    >
      <span class="os-label-s id">{{ suggestion.id }}</span>
      <span v-if="suggestion.label || suggestion.detail" class="os-body-s detail">
        {{ [suggestion.label, suggestion.detail].filter(Boolean).join(' · ') }}
      </span>
    </li>
  </ul>
</template>

<style scoped>
.suggestions {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 10; min-width: 220px; margin: 0;
  padding: 4px 0; list-style: none; max-height: 280px; overflow-y: auto; background: #fff; text-align: left;
  border: 1px solid var(--os-neutral-100); border-radius: var(--os-radius); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
.suggestions li { display: flex; flex-direction: column; padding: 6px 12px; cursor: pointer; }
.suggestions li.active { background: var(--os-primary-t-100); }
.suggestions li.info { cursor: default; color: var(--os-neutral-300); }
.suggestions li.error { color: var(--os-red-1000); }
.id { color: var(--os-neutral-700); overflow-wrap: anywhere; }
.detail { color: var(--os-neutral-300); overflow-wrap: anywhere; }
</style>
