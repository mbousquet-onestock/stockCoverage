<script setup lang="ts">
import type { Suggestion } from '../api';
import { useSuggestions, type SuggestFn } from '../composables/useSuggestions';
import SuggestList from './SuggestList.vue';

/** Single value input with OneStock suggestions (table cells): Enter or a click takes the suggestion's id. */
const props = withDefaults(
  defineProps<{
    suggest?: SuggestFn;
    minChars?: number;
    placeholder?: string;
    ariaLabel?: string;
    loadingText?: string;
    emptyText?: string;
  }>(),
  { minChars: 2 },
);
const model = defineModel<string>({ required: true });

const s = useSuggestions({ suggest: () => props.suggest, minChars: () => props.minChars });
const listId = `suggest-${Math.random().toString(36).slice(2)}`;

function pick(suggestion: Suggestion) {
  model.value = suggestion.id;
  s.close();
}

async function onEnter() {
  // Empty cell: nothing to pick, unless a suggestion was chosen with the arrows.
  if (!model.value && s.active.value < 0) return s.close();
  const chosen = await s.settle(model.value);
  if (chosen) pick(chosen);
  else s.close();
}
</script>

<template>
  <div class="suggest-input">
    <input
      v-model.trim="model"
      class="cell"
      role="combobox"
      autocomplete="off"
      :aria-label="ariaLabel"
      :aria-expanded="s.open.value"
      :aria-controls="listId"
      :placeholder="placeholder"
      @input="s.lookup(model)"
      @keydown.enter.prevent="onEnter"
      @keydown.down.prevent="s.move(1, model)"
      @keydown.up.prevent="s.move(-1, model)"
      @keydown.esc="s.close()"
      @focus="minChars === 0 && s.lookup(model, 0)"
      @blur="s.close()"
    />
    <SuggestList
      v-if="s.open.value"
      :id="listId"
      :suggestions="s.visible.value"
      :active="s.active.value"
      :loading="s.loading.value"
      :error="s.error.value"
      :loading-text="loadingText"
      :empty-text="emptyText"
      @pick="pick"
      @hover="(i) => (s.active.value = i)"
    />
  </div>
</template>

<style scoped>
.suggest-input { position: relative; }
.cell {
  width: 100%; min-width: 90px; height: 30px; padding: 4px 8px; border: 1px solid var(--os-neutral-100);
  border-radius: var(--os-radius); background: #fff; color: var(--os-neutral-700); font: inherit; outline: none;
}
.cell:focus { border-color: var(--os-primary-1000); }
</style>
