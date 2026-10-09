import { computed, onBeforeUnmount, ref } from 'vue';
import { getImport, type CoverageImport } from '../api';
import type { OnestockContext } from './useOnestockContext';
import { t, type MessageKey } from '../i18n';

/** Follow-up of an asynchronous import just sent: GET /stock_coverage_imports/{id} every 5 s until it is done. */
export function useImportStatus(context: OnestockContext) {
  const current = ref<CoverageImport | null>(null);
  const error = ref('');
  let timer: ReturnType<typeof setTimeout> | undefined;

  const done = computed(() => ['completed', 'timed_out'].includes(current.value?.status ?? ''));
  const text = computed(() => {
    const imp = current.value;
    if (!imp) return '';
    return t('import.progress', {
      id: imp.id,
      status: t(`imports.status.${imp.status}` as MessageKey),
      received: imp.details?.received_stock_coverages ?? '–',
      imported: imp.details?.imported_stock_coverages ?? '–',
      invalid: imp.details?.invalid_stock_coverages ?? '–',
    });
  });

  async function poll(id: string) {
    try {
      current.value = (await getImport(context, id)) ?? { id, status: 'closed' };
      error.value = '';
    } catch (err) {
      error.value = (err as Error).message;
    }
    if (!done.value) timer = setTimeout(() => poll(id), 5000);
  }

  function track(id: string) {
    clearTimeout(timer);
    current.value = { id, status: 'closed' };
    poll(id);
  }

  function reset() {
    clearTimeout(timer);
    current.value = null;
    error.value = '';
  }

  onBeforeUnmount(() => clearTimeout(timer));
  return { current, done, text, error, track, reset };
}
