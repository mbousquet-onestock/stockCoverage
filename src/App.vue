<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { OsAlert, OsButton, OsTabs } from '#ds';
import ConsultView from './views/ConsultView.vue';
import UpdateView from './views/UpdateView.vue';
import ImportsView from './views/ImportsView.vue';
import SettingsView from './views/SettingsView.vue';
import { useOnestockContext } from './composables/useOnestockContext';
import { store, loadSettings, isConfigured } from './settings';
import { setLang, t } from './i18n';

const { context } = useOnestockContext();

// Static texts follow the language of the OneStock context.
watch(() => context.lang, setLang, { immediate: true });

const tabs = computed(() => [
  { id: 'consult', label: t('tab.consult') },
  { id: 'update', label: t('tab.update') },
  { id: 'imports', label: t('tab.imports') },
  { id: 'settings', label: t('tab.settings') },
]);
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
      <h1 class="os-title-l title">{{ t('app.title') }}</h1>
      <span v-if="context.siteId" class="os-body-s site">{{ t('app.site', { site: context.siteId }) }}</span>
    </header>
    <OsTabs v-model="tab" :tabs="tabs" />

    <OsAlert v-if="!context.ready" type="neutral" :subtitle="t('context.loading')" />
    <OsAlert v-else-if="!context.siteId" type="warning" :title="t('context.noSite')" />
    <OsAlert
      v-if="store.loaded && !configured && tab !== 'settings'"
      type="warning"
      :title="t('token.missingTitle')"
      :subtitle="t('token.missingText')"
    >
      <template #actions>
        <OsButton type="secondary" :text="t('tab.settings')" @click="tab = 'settings'" />
      </template>
    </OsAlert>
    <OsAlert
      v-if="store.created.length"
      type="info"
      :title="t('settings.created')"
      :subtitle="t('settings.createdText', { keys: store.created.join(', ') })"
    />
    <OsAlert v-if="store.error && tab !== 'settings'" type="danger" :title="t('settings.unreadable')" :subtitle="store.error" />

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
