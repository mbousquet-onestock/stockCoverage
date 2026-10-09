<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { OsAlert, OsBadge, OsButton, OsCardLayout, OsSelect } from '#ds';
import type { OnestockContext } from '../composables/useOnestockContext';
import { readCoverages, searchEndpoints, searchItems, uploadCoverages, type Coverage } from '../api';
import { setting } from '../settings';
import { coverageKey, coveragesToCsv, missingPairs, parseIds } from '#lib/coverage.js';
import { isDirty, rowCoverage, rowOf, type EditableRow } from '../rows';
import { downloadText } from '../download';
import { t } from '../i18n';
import CoverageTable from '../components/CoverageTable.vue';
import SearchField from '../components/SearchField.vue';
import { useImportStatus } from '../composables/useImportStatus';

const props = defineProps<{ context: OnestockContext }>();

const importStatus = useImportStatus(props.context);
const itemIds = ref<string[]>([]);
const endpointIds = ref<string[]>([]);
const itemField = ref<InstanceType<typeof SearchField>>();
const endpointField = ref<InstanceType<typeof SearchField>>();
const suggestItems = (text: string) => searchItems(props.context, text);
const suggestEndpoints = (text: string) => searchEndpoints(props.context, text);
const rows = ref<EditableRow[]>([]);
const searched = ref<{ items: number; endpoints: number } | null>(null);
/** Filters of the results (applied in the browser): '' = all. */
const assortmentFilter = ref('');
const coverageFilter = ref('');
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const success = ref('');

const found = computed(() => rows.value.filter((r) => r.original).length);
const shownRows = computed(() =>
  rows.value.filter(
    (r) =>
      (!assortmentFilter.value || String(r.assortment) === assortmentFilter.value) &&
      (!coverageFilter.value || (coverageFilter.value === 'found') === Boolean(r.original)),
  ),
);
const assortmentOptions = computed(() => [
  { id: '', primaryText: t('consult.all') },
  { id: 'true', primaryText: t('consult.inAssortment') },
  { id: 'false', primaryText: t('consult.outOfAssortment') },
]);
const coverageOptions = computed(() => [
  { id: '', primaryText: t('consult.all') },
  { id: 'found', primaryText: t('consult.withCoverage') },
  { id: 'missing', primaryText: t('consult.withoutCoverage') },
]);
const changed = computed(() => rows.value.filter(isDirty));
const invalid = computed(() => changed.value.filter((r) => rowCoverage(r).error));

// Pre-fill from the page the extension is opened from, else the default stock locations of the settings.
watch(
  () => [props.context.itemIds, props.context.endpointIds, setting('default_endpoint_ids')] as const,
  () => {
    if (!itemIds.value.length && props.context.itemIds.length) itemIds.value = [...props.context.itemIds];
    if (!endpointIds.value.length) {
      endpointIds.value = props.context.endpointIds.length
        ? [...props.context.endpointIds]
        : parseIds(setting('default_endpoint_ids'));
    }
  },
  { immediate: true },
);

async function search() {
  // Text typed but not validated yet counts too.
  itemField.value?.commit();
  endpointField.value?.commit();
  if (loading.value) return;
  // OneStock requires at least one item and one stock location.
  if (!itemIds.value.length || !endpointIds.value.length) {
    error.value = t('consult.filterRequired');
    return;
  }
  error.value = '';
  success.value = '';
  loading.value = true;
  try {
    const coverages = await readCoverages(props.context, itemIds.value, endpointIds.value);
    show(coverages);
    searched.value = { items: itemIds.value.length, endpoints: endpointIds.value.length };
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}

/** Found coverages first, then the pairs asked for that have none (to be filled in). */
function show(coverages: Coverage[]) {
  const unique = new Map(coverages.map((c) => [coverageKey(c), c]));
  rows.value = [
    ...[...unique.values()].map((c) => rowOf(c, c)),
    ...missingPairs(itemIds.value, endpointIds.value, [...unique.values()]).map((pair: Pick<Coverage, 'item_id' | 'endpoint_id'>) => rowOf(pair)),
  ];
}

function cancel() {
  for (const row of rows.value) {
    row.sales = row.original ? String(row.original.sales_per_period) : '';
    row.assortment = row.original?.assortment ?? true;
  }
}

async function save() {
  error.value = '';
  success.value = '';
  saving.value = true;
  try {
    const coverages = changed.value.map((r) => rowCoverage(r).coverage!);
    const result = await uploadCoverages(props.context, coverages);
    if (result.mode === 'async') {
      success.value = t('consult.savedAsync', { n: coverages.length, id: result.importId! });
      importStatus.track(result.importId!);
    } else {
      success.value = t('consult.saved', { n: coverages.length });
      // OneStock applies the coverages it accepted: they become the reference values.
      for (const row of changed.value) row.original = rowCoverage(row).coverage!;
    }
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    saving.value = false;
  }
}

function exportCsv() {
  const coverages = rows.value.filter((r) => r.original).map((r) => r.original!);
  downloadText(`couvertures-${props.context.siteId || 'site'}.csv`, coveragesToCsv(coverages));
}
</script>

<template>
  <section class="view">
    <div class="filter-bar">
      <SearchField
        ref="itemField"
        v-model="itemIds"
        :label="t('consult.item')"
        :placeholder="t('consult.itemPlaceholder')"
        :remove-label="t('table.remove')"
        :suggest="suggestItems"
        :min-chars="0"
        :loading-text="t('consult.searching')"
        :empty-text="t('consult.noMatch')"
        @search="search"
      />
      <SearchField
        ref="endpointField"
        v-model="endpointIds"
        :label="t('consult.endpoint')"
        :placeholder="t('consult.endpointPlaceholder')"
        :remove-label="t('table.remove')"
        :suggest="suggestEndpoints"
        :min-chars="0"
        :loading-text="t('consult.searching')"
        :empty-text="t('consult.noMatch')"
        @search="search"
      />
      <div class="filter-select">
        <OsSelect v-model="assortmentFilter" :label="t('consult.assortment')" :options="assortmentOptions" />
      </div>
      <div class="filter-select">
        <OsSelect v-model="coverageFilter" :label="t('consult.coverage')" :options="coverageOptions" />
      </div>
      <div class="filter-action">
        <OsButton
          type="secondary"
          :text="t('consult.search')"
          :pending="loading"
          :disabled="!itemIds.length || !endpointIds.length"
          @click="search"
        />
      </div>
    </div>
    <span class="os-body-s hint">{{ t('consult.searchHint') }}</span>

    <OsAlert v-if="error" type="danger" :title="t('common.error')" :subtitle="error" />
    <OsAlert v-if="success" type="success" :subtitle="success" />
    <OsAlert
      v-if="importStatus.current.value"
      :type="importStatus.done.value ? (importStatus.current.value.details?.invalid_stock_coverages ? 'warning' : 'success') : 'neutral'"
      :subtitle="importStatus.error.value || importStatus.text.value"
    />

    <OsCardLayout v-if="searched">
      <div class="group">
        <div class="head">
          <div class="os-label-l">{{ t('consult.results') }}</div>
          <div class="badges">
            <OsBadge :text="t('consult.found', { n: found })" color="green" />
            <OsBadge
              v-if="rows.length - found"
              :text="t('consult.missing', { n: rows.length - found })"
              color="grey"
            />
          </div>
        </div>
        <span class="os-body-s hint">{{ t('consult.hint', { period: setting('period_label') || t('common.period') }) }}</span>
        <CoverageTable :rows="shownRows" :period-label="setting('period_label')" />
        <OsAlert
          v-if="invalid.length"
          type="warning"
          :subtitle="t('consult.invalid', { n: invalid.length })"
        />
        <div class="actions">
          <OsButton class="left" type="tertiary" :text="t('consult.export')" :disabled="!found" @click="exportCsv" />
          <OsButton type="secondary" :text="t('consult.cancel')" :disabled="!changed.length" @click="cancel" />
          <OsButton
            :text="changed.length ? t('consult.saveN', { n: changed.length }) : t('common.save')"
            :pending="saving"
            :disabled="!changed.length || invalid.length > 0"
            @click="save"
          />
        </div>
      </div>
    </OsCardLayout>
  </section>
</template>

<style scoped>
.view { display: flex; flex-direction: column; gap: 16px; }
.filter-bar { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 12px; }
.filter-select { flex: 1 1 160px; min-width: 150px; max-width: 240px; display: flex; }
.filter-action { margin-left: auto; padding-top: 20px; }
.view > .hint { margin-top: -8px; }
.group { display: flex; flex-direction: column; gap: 12px; }
.head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.badges { display: flex; gap: 8px; flex-wrap: wrap; }
.hint { color: var(--os-neutral-300); }
.actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.actions .left { margin-right: auto; }
</style>
