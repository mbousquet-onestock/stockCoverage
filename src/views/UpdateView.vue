<script setup lang="ts">
import { computed, ref } from 'vue';
import { OsAlert, OsBadge, OsButton, OsCardLayout, OsCheckbox, OsDivider, OsInputText } from '#ds';
import type { OnestockContext } from '../composables/useOnestockContext';
import { resetCoverages, uploadCoverages, type UploadProgress } from '../api';
import { setting } from '../settings';
import { endOfDayTimestamp, MAX_SYNC_COVERAGES, parseCoveragesCsv, uploadPlan } from '#lib/coverage.js';
import { rowCoverage, rowOf, type EditableRow } from '../rows';
import CoverageTable from '../components/CoverageTable.vue';

const props = defineProps<{ context: OnestockContext }>();
const emit = defineEmits<{ openImport: [id: string] }>();

const rows = ref<EditableRow[]>([rowOf({ item_id: '', endpoint_id: '' })]);
const csvText = ref('');
const csvErrors = ref<{ line: number; message: string }[]>([]);
const sending = ref(false);
const progress = ref<UploadProgress | null>(null);
const error = ref('');
const success = ref('');

const periodLabel = computed(() => setting('period_label') || 'période');
/** Lines left completely empty are ignored. */
const filled = computed(() => rows.value.filter((r) => r.item_id || r.endpoint_id || r.sales.trim()));
const invalid = computed(() => filled.value.filter((r) => rowCoverage(r).error));
const plan = computed(() => uploadPlan(filled.value));
const planText = computed(() => {
  const n = filled.value.length;
  if (!n) return '';
  return plan.value.mode === 'sync'
    ? `${n} ligne(s) : envoi direct (POST /stock_coverages).`
    : `${n} lignes (plus de ${MAX_SYNC_COVERAGES}) : import asynchrone en ${plan.value.batches.length} lot(s).`;
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
      success.value = `Import ${result.importId} créé et fermé : ${coverages.length} ligne(s) en cours de traitement par OneStock.`;
      emit('openImport', result.importId!);
    } else {
      success.value = `${coverages.length} couverture(s) enregistrée(s).`;
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
    resetMessage.value = { type: 'success', text: `Couvertures créées jusqu'au ${resetDate.value} inclus supprimées.` };
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
        <div class="os-label-l">Importer un fichier CSV</div>
        <span class="os-body-s hint">
          Colonnes <code>item_id;endpoint_id;sales_per_period;assortment</code> (séparateur « ; », « , » ou tabulation,
          ligne d'en-tête facultative, assortment vide = true). Le fichier remplace les lignes ci-dessous.
        </span>
        <label class="textarea">
          <span class="os-body-m">Contenu CSV</span>
          <textarea
            v-model="csvText"
            class="os-label-s mono"
            rows="5"
            placeholder="item_id;endpoint_id;sales_per_period;assortment&#10;1000102010203;main_MC;23;true"
          />
        </label>
        <div class="actions">
          <label class="file os-body-l">
            Choisir un fichier…
            <input type="file" accept=".csv,.txt,text/csv,text/plain" @change="onFile" />
          </label>
          <OsButton type="secondary" text="Charger le CSV" :disabled="!csvText.trim()" @click="loadCsv" />
        </div>
        <OsAlert
          v-if="csvErrors.length"
          type="warning"
          :title="`${csvErrors.length} ligne(s) ignorée(s)`"
          :subtitle="csvErrors.slice(0, 10).map((e) => `Ligne ${e.line} : ${e.message}`).join(' · ') + (csvErrors.length > 10 ? ' …' : '')"
        />
      </div>
    </OsCardLayout>

    <OsCardLayout>
      <div class="group">
        <div class="head">
          <div class="os-label-l">Couvertures à envoyer</div>
          <OsBadge v-if="filled.length" :text="`${filled.length} ligne(s)`" color="blue" />
        </div>
        <span class="os-body-s hint">
          Une ligne existante dans OneStock (même article et même lieu de stock) est remplacée.
        </span>
        <CoverageTable :rows="rows" editable-ids removable :period-label="periodLabel" @remove="remove" />
        <div class="actions">
          <OsButton class="left" type="tertiary" text="+ Ajouter une ligne" @click="addRow" />
          <OsButton type="tertiary" text="Tout effacer" @click="clearAll" />
        </div>

        <OsAlert v-if="invalid.length" type="warning" :subtitle="`${invalid.length} ligne(s) invalide(s) à corriger.`" />
        <span v-if="planText" class="os-body-s hint">{{ planText }}</span>
        <OsAlert
          v-if="sending && progress"
          type="neutral"
          :subtitle="`Envoi : ${progress.sent} / ${progress.total} ligne(s)${progress.importId ? ` — import ${progress.importId}` : ''}`"
        />
        <OsAlert v-if="error" type="danger" title="Erreur" :subtitle="error" />
        <OsAlert v-if="success" type="success" :subtitle="success" />
        <div class="actions">
          <OsButton
            text="Envoyer à OneStock"
            :pending="sending"
            :disabled="!filled.length || invalid.length > 0"
            @click="send"
          />
        </div>
      </div>
    </OsCardLayout>

    <OsCardLayout>
      <div class="group">
        <div class="os-label-l">Réinitialiser les couvertures</div>
        <span class="os-body-s hint">
          Supprime toutes les couvertures du site créées jusqu'à la date choisie incluse (PATCH /reset_stock_coverages).
          Opération irréversible.
        </span>
        <div class="row">
          <OsInputText v-model="resetDate" type="date" label="Créées jusqu'au" />
        </div>
        <OsCheckbox
          v-model="resetConfirmed"
          :disabled="!resetBefore"
          :label="`Je confirme la suppression des couvertures du site ${context.siteId || ''}`"
        />
        <OsAlert v-if="resetMessage" :type="resetMessage.type" :subtitle="resetMessage.text" />
        <OsDivider />
        <div class="actions">
          <OsButton
            color="red"
            text="Supprimer"
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
