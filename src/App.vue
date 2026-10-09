<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { OsAlert, OsButton, OsTabs } from '#ds';
import ConsultView from './views/ConsultView.vue';
import UpdateView from './views/UpdateView.vue';
import ImportsView from './views/ImportsView.vue';
import SettingsView from './views/SettingsView.vue';
import { useOnestockContext } from './composables/useOnestockContext';
import { store, loadSettings, isConfigured } from './settings';

const { context } = useOnestockContext();

const tabs = [
  { id: 'consult', label: 'Consulter' },
  { id: 'update', label: 'Mettre à jour' },
  { id: 'imports', label: 'Imports' },
  { id: 'settings', label: 'Paramètres' },
];
const tab = ref('consult');
const highlightImport = ref('');
const configured = computed(() => store.loaded && isConfigured());

function openImport(id: string) {
  highlightImport.value = id;
  tab.value = 'imports';
}

// In the back office the context arrives with the handshake, after the first render.
watch(
  () => [context.ready, context.siteId, context.extensionId, context.apiUrl] as const,
  ([ready]) => {
    if (ready) loadSettings(context);
  },
  { immediate: true },
);
// Nothing works without a token: open the settings tab directly.
watch(
  () => store.loaded && !isConfigured(),
  (missing) => {
    if (missing) tab.value = 'settings';
  },
);
</script>

<template>
  <main class="app">
    <header class="head">
      <h1 class="os-title-l title">Couverture de stock</h1>
      <span v-if="context.siteId" class="os-body-s site">Site {{ context.siteId }}</span>
    </header>
    <OsTabs v-model="tab" :tabs="tabs" />

    <OsAlert v-if="!context.ready" type="neutral" subtitle="Chargement du contexte OneStock…" />
    <OsAlert v-else-if="!context.siteId" type="warning" title="Site ID manquant dans le contexte" />
    <OsAlert
      v-if="store.loaded && !configured && tab !== 'settings'"
      type="warning"
      title="onestock_token introuvable"
      subtitle="Saisir le token de l'API OneStock dans l'onglet Paramètres."
    >
      <template #actions>
        <OsButton type="secondary" text="Paramètres" @click="tab = 'settings'" />
      </template>
    </OsAlert>
    <OsAlert
      v-if="store.created.length"
      type="info"
      title="Première connexion : paramètres initialisés"
      :subtitle="`Créés avec leur valeur par défaut : ${store.created.join(', ')}`"
    />
    <OsAlert v-if="store.error && tab !== 'settings'" type="danger" title="Paramètres illisibles" :subtitle="store.error" />

    <template v-if="context.ready">
      <ConsultView v-show="tab === 'consult'" :context="context" @open-import="openImport" />
      <UpdateView v-show="tab === 'update'" :context="context" @open-import="openImport" />
      <ImportsView v-if="tab === 'imports'" :context="context" :highlight="highlightImport" />
      <SettingsView v-if="tab === 'settings'" :context="context" />
    </template>
  </main>
</template>

<style scoped>
.app { padding: 16px; max-width: 1100px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
.head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.title { margin: 0; color: var(--os-neutral-700); }
.site { color: var(--os-neutral-300); }
</style>
