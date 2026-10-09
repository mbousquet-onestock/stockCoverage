<script setup lang="ts">
import { ref } from 'vue';
import { parseIds } from '#lib/coverage.js';
import type { Suggestion } from '../api';
import { useSuggestions, type SuggestFn } from '../composables/useSuggestions';
import SuggestList from './SuggestList.vue';

/**
 * Search field of the OneStock filter bar: label above, magnifier inside, several values shown as chips.
 * While typing, `suggest` proposes matching values (OneStock API): Enter picks the highlighted one (the first by
 * default, waiting for the answer if needed), the mouse or the arrows choose another. Without suggestion, Enter adds
 * the typed text as is; comma or paste add several ids as they are. Enter on an empty field starts the search.
 */
const props = withDefaults(
  defineProps<{
    label: string;
    placeholder?: string;
    removeLabel?: string;
    suggest?: SuggestFn;
    /** Characters to type before suggestions are asked for (0: shown as soon as the field gets the focus). */
    minChars?: number;
    loadingText?: string;
    emptyText?: string;
  }>(),
  { minChars: 2 },
);
const values = defineModel<string[]>({ required: true });
const emit = defineEmits<{ search: [] }>();

const text = ref('');
const MAX_CHIPS = 6;
const expanded = ref(false);
const listId = `suggest-${Math.random().toString(36).slice(2)}`;
const s = useSuggestions({ suggest: () => props.suggest, minChars: () => props.minChars, exclude: () => values.value });

function add(ids: string[]) {
  if (ids.length) values.value = [...new Set([...values.value, ...ids])];
}

function commit() {
  const ids = parseIds(text.value);
  text.value = '';
  s.close();
  add(ids);
  return ids.length > 0;
}

function pick(suggestion: Suggestion) {
  add([suggestion.id]);
  text.value = '';
  s.close();
}

async function onEnter() {
  // Empty field: Enter starts the search (even when the suggestions of the focus are shown).
  if (!text.value.trim()) {
    s.close();
    return emit('search');
  }
  const chosen = await s.settle(text.value);
  if (chosen) return pick(chosen);
  if (commit()) return;
  emit('search');
}

function onInput() {
  if (/[,;\n]/.test(text.value)) commit();
  else s.lookup(text.value);
}

function onPaste(event: ClipboardEvent) {
  const pasted = event.clipboardData?.getData('text') ?? '';
  if (!/[\s,;]/.test(pasted.trim())) return;
  event.preventDefault();
  text.value += pasted;
  commit();
}

function onBackspace() {
  if (!text.value && values.value.length) values.value = values.value.slice(0, -1);
}

/** Leaving the field keeps what was typed as a value (after a click in the list has been handled). */
function onBlur() {
  setTimeout(() => {
    if (text.value.trim()) commit();
    else s.close();
  }, 150);
}

function remove(id: string) {
  values.value = values.value.filter((v) => v !== id);
}

defineExpose({ commit });
</script>

<template>
  <div class="search-field">
    <label class="os-body-m label">
      {{ props.label }}
      <span class="field">
        <input
          v-model="text"
          class="os-label-s"
          role="combobox"
          autocomplete="off"
          :aria-expanded="s.open.value"
          :aria-controls="listId"
          :placeholder="placeholder"
          @keydown.enter.prevent="onEnter"
          @keydown.down.prevent="s.move(1, text)"
          @keydown.up.prevent="s.move(-1, text)"
          @keydown.esc="s.close()"
          @keydown.backspace="onBackspace"
          @input="onInput"
          @paste="onPaste"
          @focus="minChars === 0 && s.lookup(text, 0)"
          @blur="onBlur"
        />
        <button type="button" class="icon" tabindex="-1" :aria-label="props.label" @click="onEnter">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              fill="currentColor"
              d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5Zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14Z"
            />
          </svg>
        </button>
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
      </span>
    </label>

    <div v-if="values.length" class="chips">
      <span v-for="id in expanded ? values : values.slice(0, MAX_CHIPS)" :key="id" class="chip os-body-s">
        {{ id }}
        <button type="button" :aria-label="`${removeLabel ?? '×'} ${id}`" @click="remove(id)">×</button>
      </span>
      <button v-if="values.length > MAX_CHIPS" type="button" class="chip more os-body-s" @click="expanded = !expanded">
        {{ expanded ? '−' : `+${values.length - MAX_CHIPS}` }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.search-field {
  display: flex; flex-direction: column; gap: 6px;
  flex: 1 1 220px; min-width: 200px; max-width: 320px;
}
.label { display: flex; flex-direction: column; gap: 4px; color: var(--os-neutral-500); }
.field {
  position: relative; display: flex; align-items: center; height: 36px; border: 1px solid var(--os-neutral-100);
  border-radius: var(--os-radius); background: #fff;
}
.field:focus-within { border-color: var(--os-primary-1000); }
.field input {
  flex: 1; min-width: 0; height: 100%; padding: 0 4px 0 12px; border: none; outline: none; background: transparent;
  color: var(--os-neutral-700);
}
.field input::placeholder { color: var(--os-neutral-300); }
.icon {
  display: flex; align-items: center; justify-content: center; width: 36px; height: 100%; padding: 0;
  border: none; background: none; color: var(--os-neutral-300); cursor: pointer;
}
.icon:hover { color: var(--os-primary-1000); }
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip {
  display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px 2px 8px; border-radius: 12px;
  color: var(--os-primary-1000); background: var(--os-primary-t-100); max-width: 100%; overflow-wrap: anywhere;
}
.chip button {
  border: none; background: none; color: inherit; cursor: pointer; font-size: 14px; line-height: 1; padding: 0 2px;
}
.chip.more { border: none; padding: 2px 8px; cursor: pointer; }
</style>
