<script setup lang="ts">
import { computed, ref } from 'vue';
import { OsAlert, OsBadge, OsButton, OsCardLayout, OsCheckbox, OsDivider, OsInputText } from '#ds';
import type { OnestockContext } from '../composables/useOnestockContext';
import { resetCoverages, searchEndpoints, searchItems, uploadCoverages, type UploadProgress } from '../api';
import { setting } from '../settings';
import { endOfDayTimestamp, MAX_SYNC_COVERAGES, parseCoveragesCsv, uploadPlan } from '#lib/coverage.js';
import { rowCoverage, rowOf, type EditableRow } from '../rows';
import CoverageTable from '../components/CoverageTable.vue';
import { useImportStatus } from '../composables/useImportStatus';
import { errorText, t } from '../i18n';

const props = defineProps<{ context: OnestockContext }>();

const importStatus = useImportStatus(props.context);
const rows = ref<EditableRow[]>([rowOf({ item_id: '', endpoint_id: '' })]);
const csvText = ref('');
const csvErrors = ref<{ line: number; code: string; value?: string }[]>([]);
const sending = ref(false);
const progress = ref<UploadProgress | null>(null);
const error = ref('');
const success = ref('');

const periodLabel = computed(() => setting('period_label'));
const suggestItems = (text: string) => searchItems(props.context, text);
const suggestEndpoints = (text: string) => searchEndpoints(props.context, text);
/** Lines left completely empty are ignored. */
const filled = computed(() => rows.value.filter((r) => r.item_id || r.endpoint_id || r.sales.trim()));
const invalid = computed(() => filled.value.filter((r) => rowCoverage(r).error));
const plan = computed(() => uploadPlan(filled.value));
const planText = computed(() => {
  const n = filled.value.length;
  if (!n) return '';
  return plan.value.mode === 'sync'
    ? t('update.planSync', { n })
    : t('update.planAsync', { n, max: MAX_SYNC_COVERAGES, batches: plan.value.batches.length });
});
const csvErrorText = computed(() => {
  const shown = csvErrors.value.slice(0, 10).map((e) => t('update.csvLine', { line: e.line, message: errorText(e) }));
  return shown.join(' · ') + (csvErrors.value.length > 10 ? ' …' : '');
});
const progressText = computed(() => {
  const p = progress.value;
  if (!p) return '';
  return p.importId
    ? t('update.progressImport', { sent: p.sent, total: p.total, id: p.importId })
    : t('update.progress', { sent: p.sent, total: p.total });
});

function addRow() {
  const last = rows.value.at(-1);
  rows.value.push(rowOf({ item_id: '', endpoint_id: last?.endpoint_id ?? '' }));
}

function remove(row: EditableRow) {
  rows.value = rows.value.filter((r) => r !== row);
  if (!rows.value.length) addRow();
}

function clearAll() {
  importStatus.reset();
  rows.value = [rowOf({ item_id: '', endpoint_id: '' })];
  csvErrors.value = [];
  progress.value = null;
  success.value = '';
  error.value = '';
}

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  csvText.value = await file.text();
  (event.target as HTMLInputElement).value = '';
  loadCsv();
}

/** Replaces the lines of the table with those of the CSV. */
function loadCsv() {
  const { coverages, errors } = parseCoveragesCsv(csvText.value);
  csvErrors.value = errors;
  if (coverages.length) rows.value = coverages.map((c: Parameters<typeof rowOf>[0]) => rowOf(c));
}

async function send() {
  error.value = '';
  success.value = '';
  sending.value = true;
  try {
    const coverages = filled.value.map((r) => rowCoverage(r).coverage!);
    const result = await uploadCoverages(props.context, coverages, (p) => (progress.value = p));
    if (result.mode === 'async') {
      success.value = t('update.sentAsync', { id: result.importId!, n: coverages.length });
      importStatus.track(result.importId!);
    } else {
      success.value = t('update.sent', { n: coverages.length });
    }
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    sending.value = false;
  }
}

// Reset (PATCH /reset_stock_coverages), guarded by an explicit confirmation.
const resetDate = ref('');
const resetConfirmed = ref(false);
const resetting = ref(false);
const resetMessage = ref<{ type: 'success' | 'danger'; text: string } | null>(null);
const resetBefore = computed(() => endOfDayTimestamp(resetDate.value));

async function reset() {
  if (!resetBefore.value) return;
  resetting.value = true;
  resetMessage.value = null;
  try {
    await resetCoverages(props.context, resetBefore.value);
    resetMessage.value = { type: 'success', text: t('update.resetDone', { date: resetDate.value }) };
    resetConfirmed.value = false;
  } catch (err) {
    resetMessage.value = { type: 'danger', text: (err as Error).message };
  } finally {
    resetting.value = false;
  }
}
</script>

<template>
  <section class="view">
    <OsCardLayout>
      <div class="group">
        <div class="os-label-l">{{ t('update.csvTitle') }}</div>
        <span class="os-body-s hint">{{ t('update.csvHint') }}</span>
        <label class="textarea">
          <span class="os-body-m">{{ t('update.csvContent') }}</span>
          <textarea
            v-model="csvText"
            class="os-label-s mono"
            rows="5"
            placeholder="item_id;endpoint_id;sales_per_period;assortment&#10;1000102010203;main_MC;23;true"
          />
        </label>
        <div class="actions">
          <label class="file os-body-l">
            {{ t('update.chooseFile') }}
            <input type="file" accept=".csv,.txt,text/csv,text/plain" @change="onFile" />
          </label>
          <OsButton type="secondary" :text="t('update.loadCsv')" :disabled="!csvText.trim()" @click="loadCsv" />
        </div>
        <OsAlert
          v-if="csvErrors.length"
          type="warning"
          :title="t('update.csvErrors', { n: csvErrors.length })"
          :subtitle="csvErrorText"
        />
      </div>
    </OsCardLayout>

    <OsCardLayout>
      <div class="group">
        <div class="head">
          <div class="os-label-l">{{ t('update.title') }}</div>
          <OsBadge v-if="filled.length" :text="t('update.lines', { n: filled.length })" color="blue" />
        </div>
        <span class="os-body-s hint">{{ t('update.hint') }}</span>
        <CoverageTable
          :rows="rows"
          editable-ids
          removable
          :period-label="periodLabel"
          :suggest-item="suggestItems"
          :suggest-endpoint="suggestEndpoints"
          @remove="remove"
        />
        <div class="actions">
          <OsButton class="left" type="tertiary" :text="t('update.addRow')" @click="addRow" />
          <OsButton type="tertiary" :text="t('update.clear')" @click="clearAll" />
        </div>

        <OsAlert v-if="invalid.length" type="warning" :subtitle="t('update.invalid', { n: invalid.length })" />
        <span v-if="planText" class="os-body-s hint">{{ planText }}</span>
        <OsAlert
          v-if="sending && progress"
          type="neutral"
          :subtitle="progressText"
        />
        <OsAlert v-if="error" type="danger" :title="t('common.error')" :subtitle="error" />
        <OsAlert v-if="success" type="success" :subtitle="success" />
    <OsAlert
      v-if="importStatus.current.value"
      :type="importStatus.done.value ? (importStatus.current.value.details?.invalid_stock_coverages ? 'warning' : 'success') : 'neutral'"
      :subtitle="importStatus.error.value || importStatus.text.value"
    />
        <div class="actions">
          <OsButton
            :text="t('update.send')"
            :pending="sending"
            :disabled="!filled.length || invalid.length > 0"
            @click="send"
          />
        </div>
      </div>
    </OsCardLayout>

    <OsCardLayout>
      <div class="group">
        <div class="os-label-l">{{ t('update.resetTitle') }}</div>
        <span class="os-body-s hint">{{ t('update.resetHint') }}</span>
        <div class="row">
          <OsInputText v-model="resetDate" type="date" :label="t('update.resetDate')" />
        </div>
        <OsCheckbox
          v-model="resetConfirmed"
          :disabled="!resetBefore"
          :label="t('update.resetConfirm', { site: context.siteId || '' })"
        />
        <OsAlert v-if="resetMessage" :type="resetMessage.type" :subtitle="resetMessage.text" />
        <OsDivider />
        <div class="actions">
          <OsButton
            color="red"
            :text="t('update.resetButton')"
            :pending="resetting"
            :disabled="!resetBefore || !resetConfirmed"
            @click="reset"
          />
        </div>
      </div>
    </OsCardLayout>
  </section>
</template>

<style scoped>
.view { display: flex; flex-direction: column; gap: 16px; }
.group { display: flex; flex-direction: column; gap: 12px; }
.head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.row { display: flex; gap: 12px; flex-wrap: wrap; max-width: 280px; }
.hint { color: var(--os-neutral-300); }
.textarea { display: flex; flex-direction: column; gap: 2px; color: var(--os-neutral-500); }
.textarea textarea {
  resize: vertical; padding: 8px 12px; border: 1px solid var(--os-neutral-100); border-radius: var(--os-radius);
  color: var(--os-neutral-700); outline: none; font-family: Roboto, sans-serif;
}
.textarea textarea.mono { font-family: ui-monospace, Menlo, Consolas, monospace; }
.textarea textarea:focus { border-color: var(--os-primary-1000); }
.actions { display: flex; justify-content: flex-end; align-items: center; gap: 8px; flex-wrap: wrap; }
.actions .left { margin-right: auto; }
.file {
  display: inline-flex; align-items: center; height: 36px; padding: 8px 16px; border-radius: var(--os-radius);
  border: 1px solid var(--os-neutral-100); color: var(--os-neutral-500); background: #fff; cursor: pointer;
  margin-right: auto;
}
.file:hover { background: var(--os-neutral-t-30); }
.file input { display: none; }
</style>
