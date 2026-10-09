<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { OsAlert, OsBadge, OsButton, OsCardLayout, OsSelect } from '#ds';
import type { OnestockContext } from '../composables/useOnestockContext';
import { formatDate, getImport, listImports, type CoverageImport, type ImportStatus } from '../api';
import { t, type MessageKey } from '../i18n';

const props = defineProps<{ context: OnestockContext; highlight?: string }>();

const PAGE_SIZE = 20;
const imports = ref<CoverageImport[]>([]);
const status = ref('');
const start = ref(0);
const loading = ref(false);
const error = ref('');

const STATUS_COLORS: Record<ImportStatus, 'blue' | 'orange' | 'green' | 'red'> = {
  open: 'blue',
  closed: 'orange',
  completed: 'green',
  timed_out: 'red',
};

const statusOptions = computed(() => [
  { id: '', primaryText: t('imports.allStatuses') },
  ...Object.keys(STATUS_COLORS).map((id) => ({ id, primaryText: t(`imports.status.${id}` as MessageKey) })),
]);

function badge(item: CoverageImport) {
  if (!(item.status in STATUS_COLORS)) return { text: item.status, color: 'blue' as const };
  return { text: t(`imports.status.${item.status}` as MessageKey), color: STATUS_COLORS[item.status] };
}

async function load() {
  error.value = '';
  loading.value = true;
  try {
    const list = await listImports(props.context, { status: status.value, start: start.value, limit: PAGE_SIZE });
    imports.value = [...list].sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
    if (props.highlight && !imports.value.some((i) => i.id === props.highlight)) {
      const one = await getImport(props.context, props.highlight);
      if (one) imports.value.unshift(one);
    }
    schedule();
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}

async function refresh(item: CoverageImport) {
  try {
    const fresh = await getImport(props.context, item.id);
    if (fresh) imports.value = imports.value.map((i) => (i.id === item.id ? fresh : i));
  } catch (err) {
    error.value = (err as Error).message;
  }
}

// While the import just sent is being processed, its status is refreshed every 5 s.
let timer: ReturnType<typeof setTimeout> | undefined;
function schedule() {
  clearTimeout(timer);
  const pending = imports.value.find((i) => i.id === props.highlight && (i.status === 'open' || i.status === 'closed'));
  if (pending) {
    timer = setTimeout(async () => {
      await refresh(pending);
      schedule();
    }, 5000);
  }
}
onBeforeUnmount(() => clearTimeout(timer));

watch(status, () => {
  start.value = 0;
  load();
});
watch(() => props.highlight, load);
load();
</script>

<template>
  <section class="view">
    <OsCardLayout>
      <div class="group">
        <div class="head">
          <div class="os-label-l">{{ t('imports.title') }}</div>
          <div class="filters">
            <OsSelect v-model="status" :options="statusOptions" />
            <OsButton type="secondary" :text="t('common.refresh')" :pending="loading" @click="load" />
          </div>
        </div>

        <OsAlert v-if="error" type="danger" :title="t('common.error')" :subtitle="error" />
        <OsAlert v-else-if="!loading && !imports.length" type="info" :subtitle="t('imports.none')" />

        <div v-if="imports.length" class="table-wrap">
          <table class="imports os-label-s">
            <thead>
              <tr class="os-body-m">
                <th>{{ t('imports.id') }}</th>
                <th>{{ t('imports.status') }}</th>
                <th>{{ t('imports.created') }}</th>
                <th>{{ t('imports.completed') }}</th>
                <th class="num">{{ t('imports.batches') }}</th>
                <th class="num">{{ t('imports.received') }}</th>
                <th class="num">{{ t('imports.imported') }}</th>
                <th class="num">{{ t('imports.invalid') }}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in imports" :key="item.id" :class="{ highlight: item.id === highlight }">
                <td class="id">
                  {{ item.id }}
                  <div v-if="item.user_id" class="os-body-s hint">{{ item.user_id }}</div>
                </td>
                <td><OsBadge type="secondary" :text="badge(item).text" :color="badge(item).color" /></td>
                <td>{{ formatDate(item.created_at, context.lang) }}</td>
                <td>{{ formatDate(item.completed_at, context.lang) }}</td>
                <td class="num">{{ item.received_batches ?? '–' }} / {{ item.completed_batches ?? '–' }}</td>
                <td class="num">{{ item.details?.received_stock_coverages ?? '–' }}</td>
                <td class="num">{{ item.details?.imported_stock_coverages ?? '–' }}</td>
                <td class="num" :class="{ bad: (item.details?.invalid_stock_coverages ?? 0) > 0 }">
                  {{ item.details?.invalid_stock_coverages ?? '–' }}
                </td>
                <td><OsButton type="tertiary" :text="t('common.refresh')" @click="refresh(item)" /></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="pager">
          <OsButton
            type="tertiary"
            :text="t('imports.previous')"
            :disabled="start === 0 || loading"
            @click="start = Math.max(0, start - PAGE_SIZE); load()"
          />
          <OsButton
            type="tertiary"
            :text="t('imports.next')"
            :disabled="imports.length < PAGE_SIZE || loading"
            @click="start += PAGE_SIZE; load()"
          />
        </div>
      </div>
    </OsCardLayout>
  </section>
</template>

<style scoped>
.view { display: flex; flex-direction: column; gap: 16px; }
.group { display: flex; flex-direction: column; gap: 12px; }
.head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.filters { display: flex; gap: 8px; align-items: center; min-width: 280px; }
.table-wrap { overflow-x: auto; }
.imports { width: 100%; border-collapse: collapse; color: var(--os-neutral-700); }
.imports th {
  text-align: left; color: var(--os-neutral-500); padding: 8px; border-bottom: 1px solid var(--os-neutral-100);
  white-space: nowrap;
}
.imports td { padding: 6px 8px; border-bottom: 1px solid var(--os-neutral-100); vertical-align: middle; }
.imports tr.highlight td { background: var(--os-primary-t-100); }
.id { overflow-wrap: anywhere; max-width: 260px; }
.num { text-align: right; white-space: nowrap; }
.bad { color: var(--os-red-1000); font-weight: 500; }
.hint { color: var(--os-neutral-300); }
.pager { display: flex; justify-content: space-between; }
</style>
