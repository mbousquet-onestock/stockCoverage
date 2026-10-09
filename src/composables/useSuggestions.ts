import { computed, onBeforeUnmount, ref } from 'vue';
import type { Suggestion } from '../api';

export type SuggestFn = (text: string) => Promise<Suggestion[]>;

/**
 * Suggestions shown while typing (OneStock API behind `suggest`): debounced lookups, only the latest answer kept,
 * first suggestion highlighted, arrows to move, and `settle()` to wait for the answer before Enter picks one.
 */
export function useSuggestions(options: {
  suggest: () => SuggestFn | undefined;
  minChars: () => number;
  /** Values already chosen: not proposed again. */
  exclude?: () => string[];
}) {
  const suggestions = ref<Suggestion[]>([]);
  const open = ref(false);
  const loading = ref(false);
  const error = ref('');
  const active = ref(-1);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let request = 0;
  let pending: Promise<void> | null = null;

  const visible = computed(() => {
    const excluded = options.exclude?.() ?? [];
    return suggestions.value.filter((s) => !excluded.includes(s.id));
  });

  function canSuggest(text: string) {
    return Boolean(options.suggest()) && text.trim().length >= options.minChars();
  }

  function close() {
    open.value = false;
    active.value = -1;
    clearTimeout(timer);
    request++;
    loading.value = false;
  }

  async function run(id: number, query: string) {
    open.value = true;
    loading.value = true;
    error.value = '';
    try {
      const found = await options.suggest()!(query);
      if (id !== request) return;
      suggestions.value = found;
      active.value = visible.value.length ? 0 : -1;
    } catch (err) {
      if (id !== request) return;
      suggestions.value = [];
      error.value = (err as Error).message;
    } finally {
      if (id === request) loading.value = false;
    }
  }

  function lookup(text: string, delay = 300) {
    clearTimeout(timer);
    if (!canSuggest(text)) return close();
    const id = ++request;
    const query = text.trim();
    pending = new Promise<void>((resolve) => {
      timer = setTimeout(() => run(id, query).finally(resolve), delay);
    });
  }

  /** Highlighted suggestion once the lookup for `text` has answered (typed faster than the debounce included). */
  async function settle(text: string) {
    if (canSuggest(text) && (loading.value || !open.value)) {
      if (!open.value) lookup(text, 0);
      await pending;
    }
    return open.value ? visible.value[active.value] : undefined;
  }

  function move(step: number, text: string) {
    if (!open.value) return lookup(text, 0);
    const n = visible.value.length;
    if (n) active.value = (active.value + step + n) % n;
  }

  onBeforeUnmount(() => clearTimeout(timer));

  return { visible, open, loading, error, active, lookup, settle, move, close };
}
