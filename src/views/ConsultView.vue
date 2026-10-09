<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { OsAlert, OsBadge, OsButton, OsCardLayout, OsCheckbox } from '#ds';
import type { OnestockContext } from '../composables/useOnestockContext';
import { readCoverages, uploadCoverages, type Coverage } from '../api';
import { setting } from '../settings';
import { coverageKey, coveragesToCsv, missingPairs, parseIds } from '#lib/coverage.js';
import { isDirty, rowCoverage, rowOf, type EditableRow } from '../rows';
import { downloadText } from '../download';
import CoverageTable from '../components/CoverageTable.vue';

const props = defineProps<{ context: OnestockContext }>();
const emit = defineEmits<{ openImport: [id: string] }>();

const itemsText = ref('');
const endpointsText = ref('');
const rows = ref<EditableRow[]>([]);
const searched = ref<{ items: number; endpoints: number } | null>(null);
const hideMissing = ref(false);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const success = ref('');

const itemIds = computed(() => parseIds(itemsText.value));
const endpointIds = computed(() => parseIds(endpointsText.value));
const found = computed(() => rows.value.filter((r) => r.original).length);
const shownRows = computed(() => (hideMissing.value ? rows.value.filter((r) => r.original || r.sales.trim()) : rows.value));
const changed = computed(() => rows.value.filter(isDirty));
const invalid = computed(() => changed.value.filter((r) => rowCoverage(r).error));

// Pre-fill from the page the extension is opened from, else the default stock locations of the settings.
watch(
  () => [props.context.itemIds, props.context.endpointIds, setting('default_endpoint_ids')] as const,
  () => {
    if (!itemsText.value && props.context.itemIds.length) itemsText.value = props.context.itemIds.join('\n');
    if (!endpointsText.value) {
      endpointsText.value = props.context.endpointIds.length
        ? props.context.endpointIds.join('\n')
        : parseIds(setting('default_endpoint_ids')).join('\n');
    }
  },
  { immediate: true },
);

async function search() {
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
      success.value = `${coverages.length} couverture(s) envoyée(s) en import asynchrone (${result.importId}).`;
      emit('openImport', result.importId!);
    } else {
      success.value = `${coverages.length} couverture(s) mise(s) à jour.`;
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
    <OsCardLayout>
      <div class="group">
        <div class="os-label-l">Rechercher des couvertures</div>
        <div class="row">
          <label class="textarea">
            <span class="os-body-m">Articles (item_id)</span>
            <textarea v-model="itemsText" class="os-label-s" rows="5" placeholder="Un identifiant par ligne, ou séparés par des virgules" />
            <span class="os-body-s hint">{{ itemIds.length }} article(s)</span>
          </label>
          <label class="textarea">
            <span class="os-body-m">Lieux de stock (endpoint_id)</span>
            <textarea v-model="endpointsText" class="os-label-s" rows="5" placeholder="store_1, warehouse_2…" />
            <span class="os-body-s hint">{{ endpointIds.length }} lieu(x) de stock</span>
          </label>
        </div>
        <div class="actions">
          <OsButton
            text="Rechercher"
            :pending="loading"
            :disabled="!itemIds.length || !endpointIds.length"
            @click="search"
          />
        </div>
      </div>
    </OsCardLayout>

    <OsAlert v-if="error" type="danger" title="Erreur" :subtitle="error" />
    <OsAlert v-if="success" type="success" :subtitle="success" />

    <OsCardLayout v-if="searched">
      <div class="group">
        <div class="head">
          <div class="os-label-l">Résultats</div>
          <div class="badges">
            <OsBadge :text="`${found} couverture(s) trouvée(s)`" color="green" />
            <OsBadge
              v-if="rows.length - found"
              :text="`${rows.length - found} couple(s) sans couverture`"
              color="grey"
            />
          </div>
        </div>
        <span class="os-body-s hint">
          Modifier les ventes par {{ setting('period_label') || 'période' }} ou l'assortiment puis enregistrer. Les couples
          sans couverture peuvent être renseignés directement. Un article hors assortiment est compté avec 1 vente par
          période.
        </span>
        <OsCheckbox v-model="hideMissing" label="Masquer les couples sans couverture" />
        <CoverageTable :rows="shownRows" :period-label="setting('period_label') || 'période'" />
        <OsAlert
          v-if="invalid.length"
          type="warning"
          :subtitle="`${invalid.length} ligne(s) modifiée(s) invalide(s) : corriger avant d'enregistrer.`"
        />
        <div class="actions">
          <OsButton class="left" type="tertiary" text="Exporter en CSV" :disabled="!found" @click="exportCsv" />
          <OsButton type="secondary" text="Annuler les modifications" :disabled="!changed.length" @click="cancel" />
          <OsButton
            :text="changed.length ? `Enregistrer ${changed.length} modification(s)` : 'Enregistrer'"
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
.group { display: flex; flex-direction: column; gap: 12px; }
.head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.badges { display: flex; gap: 8px; flex-wrap: wrap; }
.row { display: flex; gap: 12px; flex-wrap: wrap; }
.row > * { flex: 1; min-width: 220px; }
.hint { color: var(--os-neutral-300); }
.textarea { display: flex; flex-direction: column; gap: 2px; color: var(--os-neutral-500); }
.textarea textarea {
  resize: vertical; padding: 8px 12px; border: 1px solid var(--os-neutral-100); border-radius: var(--os-radius);
  color: var(--os-neutral-700); outline: none; font-family: Roboto, sans-serif;
}
.textarea textarea:focus { border-color: var(--os-primary-1000); }
.actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.actions .left { margin-right: auto; }
</style>
