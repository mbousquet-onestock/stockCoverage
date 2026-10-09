<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { OsAlert, OsBadge, OsButton, OsCardLayout, OsDivider, OsInputText } from '#ds';
import type { OnestockContext } from '../composables/useOnestockContext';
import { store, loadSettings, saveSettings } from '../settings';
import { onestock } from '../api';

const props = defineProps<{ context: OnestockContext }>();

const form = reactive<Record<string, string>>({});
const initial = ref<Record<string, string>>({});
const message = ref<{ type: 'success' | 'danger'; text: string } | null>(null);
const saving = ref(false);
const testing = ref(false);

const siteLabel = computed(() => (store.scope?.siteId ? `site ${store.scope.siteId}` : 'tous les sites'));
const extensionId = computed(() => store.scope?.extensionId || props.context.extensionId);

function fill() {
  const values = Object.fromEntries(Object.entries(store.settings).map(([key, s]) => [key, s.value]));
  Object.assign(form, values);
  initial.value = values;
}
watch(() => store.settings, fill, { immediate: true });

function origin(key: string) {
  const s = store.settings[key];
  if (!s?.source) return 'Valeur par défaut';
  const site = s.source.site_id ? `site ${s.source.site_id}` : 'tous les sites';
  const extension = s.source.extension_id === '*' ? 'toutes les extensions' : `extension ${s.source.extension_id}`;
  const environment =
    s.source.environment && s.source.environment !== store.scope?.environment
      ? ` (repris de ${s.source.environment})`
      : '';
  return `Enregistré pour ${site}, ${extension}${environment}`;
}

const tokenText = computed(() => {
  const token = store.settings.onestock_token;
  if (token?.error) return token.error;
  if (!token?.set) return `Absent de l'API Settings (environnement ${store.scope?.environment ?? '?'}) : le saisir ci-dessous.`;
  return `${origin('onestock_token')}. Saisir une nouvelle valeur pour la remplacer (${siteLabel.value}, toutes les extensions).`;
});

const changes = computed(() =>
  Object.fromEntries(Object.entries(form).filter(([key, value]) => value !== initial.value[key])),
);

async function save() {
  saving.value = true;
  message.value = null;
  try {
    const saved = await saveSettings(props.context, changes.value);
    message.value = {
      type: 'success',
      text: saved.length ? `${saved.length} paramètre(s) enregistré(s).` : 'Aucune modification à enregistrer.',
    };
  } catch (err) {
    message.value = { type: 'danger', text: (err as Error).message };
  } finally {
    saving.value = false;
  }
}

/** Saves pending changes, then makes a harmless read through the proxy to check the token and the API URL. */
async function testConnection() {
  testing.value = true;
  message.value = null;
  try {
    if (Object.keys(changes.value).length) await saveSettings(props.context, changes.value);
    await onestock(props.context, 'GET', '/stock_coverage_imports', { pagination: { start: 0, limit: 1 } });
    message.value = { type: 'success', text: 'Connexion à l\'API OneStock réussie.' };
  } catch (err) {
    message.value = { type: 'danger', text: `API OneStock : ${(err as Error).message}` };
  } finally {
    testing.value = false;
  }
}
</script>

<template>
  <section class="settings">
    <div class="head">
      <h1 class="os-title-m title">Paramètres</h1>
      <OsBadge v-if="store.scope" :text="`Environnement : ${store.scope.environment}`" color="grey" />
    </div>

    <OsAlert v-if="store.error" type="danger" title="API Settings" :subtitle="store.error">
      <template #actions>
        <OsButton type="secondary" text="Réessayer" @click="loadSettings(context)" />
      </template>
    </OsAlert>
    <OsAlert v-else-if="store.loading && !store.loaded" type="neutral" subtitle="Chargement des paramètres…" />

    <OsCardLayout v-if="store.loaded">
      <div class="group">
        <div class="os-label-l">Connexion à l'API OneStock</div>
        <span class="os-body-s hint">
          Le token et la racine de l'API sont communs à toutes les extensions du {{ siteLabel }} (extension_id « * »).
          Le token est chiffré par l'API Settings et n'est jamais renvoyé au navigateur.
        </span>
        <div class="token">
          <OsInputText
            v-model="form.onestock_token"
            label="Token (onestock_token)"
            type="password"
            autocomplete="off"
            :placeholder="store.settings.onestock_token?.set ? '•••••••• (enregistré, laisser vide pour conserver)' : 'Token de l\'API OneStock'"
            :supporting-text="tokenText"
          />
          <OsBadge
            :text="store.settings.onestock_token?.set ? 'Présent' : 'Absent'"
            :color="store.settings.onestock_token?.set ? 'green' : 'red'"
          />
        </div>
        <OsInputText
          v-model="form.onestock_api_root"
          label="Racine de l'API (onestock_api_root)"
          :placeholder="context.apiUrl || 'https://c00.api.qualif.onestock-retail.com'"
          :supporting-text="`${origin('onestock_api_root')} — /v3 ajouté si la version n'est pas précisée`"
        />

        <OsDivider />

        <div class="os-label-l">Couvertures de stock</div>
        <span class="os-body-s hint">Propres à l'extension {{ extensionId }}, enregistrés pour le {{ siteLabel }}.</span>
        <OsInputText
          v-model="form.default_endpoint_ids"
          label="Lieux de stock proposés par défaut (endpoint_id)"
          placeholder="store_1, warehouse_2"
          :supporting-text="`Pré-remplit la recherche hors contexte — ${origin('default_endpoint_ids')}`"
        />
        <OsInputText
          v-model="form.period_label"
          label="Libellé de la période des ventes"
          placeholder="semaine"
          :supporting-text="`Affichage uniquement (« Ventes / semaine ») — ${origin('period_label')}`"
        />

        <OsAlert v-if="message" :type="message.type" :subtitle="message.text" />

        <div class="actions">
          <OsButton type="secondary" text="Tester la connexion" :pending="testing" @click="testConnection" />
          <OsButton text="Enregistrer" :pending="saving" @click="save" />
        </div>
      </div>
    </OsCardLayout>
  </section>
</template>

<style scoped>
.settings { display: flex; flex-direction: column; gap: 16px; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.title { margin: 0; }
.group { display: flex; flex-direction: column; gap: 12px; }
.hint { color: var(--os-neutral-300); }
.token { display: flex; align-items: flex-start; gap: 8px; }
.token > :deep(.os-badge) { margin-top: 22px; }
.actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
