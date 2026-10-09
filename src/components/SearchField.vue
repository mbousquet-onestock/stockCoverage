<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { parseIds } from '#lib/coverage.js';
import type { Suggestion } from '../api';

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
    suggest?: (text: string) => Promise<Suggestion[]>;
    /** Characters to type before suggestions are asked for (0: as soon as the field gets the focus). */
    minChars?: number;
    loadingText?: string;
    emptyText?: string;
  }>(),
  { minChars: 2, loadingText: '…', emptyText: '' },
);
const values = defineModel<string[]>({ required: true });
const emit = defineEmits<{ search: [] }>();

const text = ref('');
const MAX_CHIPS = 6;
const expanded = ref(false);

const suggestions = ref<Suggestion[]>([]);
const open = ref(false);
const loading = ref(false);
const suggestError = ref('');
const active = ref(-1);
let timer: ReturnType<typeof setTimeout> | undefined;
let request = 0;
/** Lookup running or waiting for the debounce, so that Enter can wait for its answer. */
let pending: Promise<void> | null = null;
const listId = `suggest-${Math.random().toString(36).slice(2)}`;

const visibleSuggestions = computed(() => suggestions.value.filter((s) => !values.value.includes(s.id)));

function add(ids: string[]) {
  if (ids.length) values.value = [...new Set([...values.value, ...ids])];
}

function commit() {
  const ids = parseIds(text.value);
  text.value = '';
  close();
  add(ids);
  return ids.length > 0;
}

function close() {
  open.value = false;
  active.value = -1;
  clearTimeout(timer);
  request++;
  loading.value = false;
}

function canSuggest() {
  return Boolean(props.suggest) && text.value.trim().length >= props.minChars;
}

async function run(id: number, query: string) {
  open.value = true;
  loading.value = true;
  suggestError.value = '';
  try {
    const found = await props.suggest!(query);
    if (id !== request) return;
    suggestions.value = found;
    active.value = visibleSuggestions.value.length ? 0 : -1;
  } catch (err) {
    if (id !== request) return;
    suggestions.value = [];
    suggestError.value = (err as Error).message;
  } finally {
    if (id === request) loading.value = false;
  }
}

function lookup(delay = 300) {
  clearTimeout(timer);
  if (!canSuggest()) {
    close();
    return;
  }
  const id = ++request;
  const query = text.value.trim();
  pending = new Promise<void>((resolve) => {
    timer = setTimeout(() => run(id, query).finally(resolve), delay);
  });
}

function pick(suggestion: Suggestion) {
  add([suggestion.id]);
  text.value = '';
  close();
}

async function onEnter() {
  // Typed faster than the debounce, or answer not back yet: wait for the suggestions.
  if (canSuggest() && (loading.value || !open.value)) {
    if (!open.value) lookup(0);
    await pending;
  }
  const chosen = open.value ? visibleSuggestions.value[active.value] : undefined;
  if (chosen) return pick(chosen);
  if (commit()) return;
  emit('search');
}

function move(step: number) {
  if (!open.value) return lookup();
  const n = visibleSuggestions.value.length;
  if (n) active.value = (active.value + step + n) % n;
}

function onInput() {
  if (/[,;\n]/.test(text.value)) commit();
  else lookup();
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

function onFocus() {
  if (props.minChars === 0) lookup();
}

/** Leaving the field keeps what was typed as a value (after a click in the list has been handled). */
function onBlur() {
  setTimeout(() => {
    if (text.value.trim()) commit();
    else close();
  }, 150);
}

function remove(id: string) {
  values.value = values.value.filter((v) => v !== id);
}

onBeforeUnmount(() => clearTimeout(timer));
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
          :aria-expanded="open"
          :aria-controls="listId"
          :placeholder="placeholder"
          @keydown.enter.prevent="onEnter"
          @keydown.down.prevent="move(1)"
          @keydown.up.prevent="move(-1)"
          @keydown.esc="close"
          @keydown.backspace="onBackspace"
          @input="onInput"
          @paste="onPaste"
          @focus="onFocus"
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
      </span>
    </label>

    <ul v-if="open" :id="listId" class="suggestions" role="listbox">
      <li v-if="loading" class="info os-body-s">{{ loadingText }}</li>
      <li v-else-if="suggestError" class="info error os-body-s">{{ suggestError }}</li>
      <li v-else-if="!visibleSuggestions.length" class="info os-body-s">{{ emptyText }}</li>
      <li
        v-for="(suggestion, i) in loading ? [] : visibleSuggestions"
        :key="suggestion.id"
        role="option"
        :aria-selected="i === active"
        :class="{ active: i === active }"
        @mousedown.prevent="pick(suggestion)"
        @mouseenter="active = i"
      >
        <span class="os-label-s id">{{ suggestion.id }}</span>
        <span v-if="suggestion.label || suggestion.detail" class="os-body-s detail">
          {{ [suggestion.label, suggestion.detail].filter(Boolean).join(' · ') }}
        </span>
      </li>
    </ul>

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
  position: relative; display: flex; flex-direction: column; gap: 6px;
  flex: 1 1 220px; min-width: 200px; max-width: 320px;
}
.label { display: flex; flex-direction: column; gap: 4px; color: var(--os-neutral-500); }
.field {
  display: flex; align-items: center; height: 36px; border: 1px solid var(--os-neutral-100);
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
.suggestions {
  position: absolute; top: 60px; left: 0; right: 0; z-index: 10; margin: 0; padding: 4px 0; list-style: none;
  max-height: 280px; overflow-y: auto; background: #fff; border: 1px solid var(--os-neutral-100);
  border-radius: var(--os-radius); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
.suggestions li { display: flex; flex-direction: column; padding: 6px 12px; cursor: pointer; }
.suggestions li.active { background: var(--os-primary-t-100); }
.suggestions li.info { cursor: default; color: var(--os-neutral-300); }
.suggestions li.error { color: var(--os-red-1000); }
.id { color: var(--os-neutral-700); overflow-wrap: anywhere; }
.detail { color: var(--os-neutral-300); overflow-wrap: anywhere; }
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
