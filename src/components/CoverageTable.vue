<script setup lang="ts">
import { computed, ref } from 'vue';
import { OsBadge, OsButton } from '#ds';
import { isDirty, rowCoverage, type EditableRow } from '../rows';
import { errorText, t } from '../i18n';
import type { SuggestFn } from '../composables/useSuggestions';
import SuggestInput from './SuggestInput.vue';

const props = withDefaults(
  defineProps<{
    rows: EditableRow[];
    /** item_id / endpoint_id can be typed (new lines). */
    editableIds?: boolean;
    removable?: boolean;
    periodLabel?: string;
    /** OneStock suggestions for the item / stock location cells (editable ids). */
    suggestItem?: SuggestFn;
    suggestEndpoint?: SuggestFn;
  }>(),
  { editableIds: false, removable: false, periodLabel: '' },
);
const emit = defineEmits<{ remove: [row: EditableRow] }>();

const PAGE = 200;
const shown = ref(PAGE);
const visible = computed(() => props.rows.slice(0, shown.value));

function status(row: EditableRow): { text: string; color: 'red' | 'orange' | 'grey' | 'green' | 'blue' } | null {
  const { error } = rowCoverage(row);
  const typed = Boolean(row.sales.trim() || (props.editableIds && (row.item_id || row.endpoint_id)));
  if (error && typed) return { text: errorText(error), color: 'red' };
  // A new line still empty has no status yet.
  if (props.editableIds && !row.original && !typed) return null;
  if (!row.original) return row.sales.trim() ? { text: t('table.new'), color: 'blue' } : { text: t('table.missing'), color: 'grey' };
  if (isDirty(row)) return { text: t('table.changed'), color: 'orange' };
  return null;
}
</script>

<template>
  <div class="table-wrap" :class="{ editable: editableIds }">
    <table class="coverage-table os-label-s">
      <thead>
        <tr class="os-body-m">
          <th>{{ t('table.item') }}</th>
          <th>{{ t('table.endpoint') }}</th>
          <th class="num">{{ t('table.sales', { period: periodLabel || t('common.period') }) }}</th>
          <th class="center">{{ t('table.assortment') }}</th>
          <th>{{ t('table.status') }}</th>
          <th v-if="removable" />
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in visible" :key="row.uid" :class="{ dirty: isDirty(row) }">
          <td>
            <SuggestInput
              v-if="editableIds"
              v-model="row.item_id"
              aria-label="item_id"
              :suggest="suggestItem"
              :min-chars="2"
              :placeholder="t('consult.itemPlaceholder')"
              :loading-text="t('consult.searching')"
              :empty-text="t('table.noMatch')"
            />
            <span v-else>{{ row.item_id }}</span>
          </td>
          <td>
            <SuggestInput
              v-if="editableIds"
              v-model="row.endpoint_id"
              aria-label="endpoint_id"
              :suggest="suggestEndpoint"
              :min-chars="1"
              :placeholder="t('consult.endpointPlaceholder')"
              :loading-text="t('consult.searching')"
              :empty-text="t('table.noMatch')"
            />
            <span v-else>{{ row.endpoint_id }}</span>
          </td>
          <td class="num">
            <input
              v-model="row.sales"
              class="cell num"
              inputmode="decimal"
              :placeholder="row.original ? '' : '—'"
              aria-label="sales_per_period"
            />
          </td>
          <td class="center">
            <input v-model="row.assortment" type="checkbox" class="check" aria-label="assortment" />
          </td>
          <td>
            <OsBadge v-if="status(row)" type="secondary" :text="status(row)!.text" :color="status(row)!.color" />
          </td>
          <td v-if="removable" class="center">
            <OsButton type="tertiary" color="red" :text="t('table.remove')" @click="emit('remove', row)" />
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="rows.length > shown" class="more">
      <span class="os-body-s hint">{{ t('table.shown', { shown, total: rows.length }) }}</span>
      <OsButton type="tertiary" :text="t('table.more')" @click="shown += PAGE" />
    </div>
  </div>
</template>

<style scoped>
.table-wrap { overflow-x: auto; }
/* Editable lines: the suggestion lists must be able to go past the table. */
.table-wrap.editable { overflow: visible; }
.coverage-table { width: 100%; border-collapse: collapse; color: var(--os-neutral-700); }
.coverage-table th {
  text-align: left; color: var(--os-neutral-500); padding: 8px; border-bottom: 1px solid var(--os-neutral-100);
  white-space: nowrap;
}
.coverage-table td { padding: 4px 8px; border-bottom: 1px solid var(--os-neutral-100); vertical-align: middle; }
.coverage-table tr.dirty td { background: var(--os-orange-t-100); }
.num { text-align: right; }
.center { text-align: center; }
.cell {
  width: 100%; min-width: 90px; height: 30px; padding: 4px 8px; border: 1px solid var(--os-neutral-100);
  border-radius: var(--os-radius); background: #fff; color: var(--os-neutral-700); font: inherit; outline: none;
}
.cell:focus { border-color: var(--os-primary-1000); }
.check { width: 18px; height: 18px; accent-color: var(--os-primary-1000); cursor: pointer; }
.more { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding-top: 8px; }
.hint { color: var(--os-neutral-300); }
</style>
