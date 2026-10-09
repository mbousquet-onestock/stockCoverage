<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { OsAlert, OsButton } from '#ds';
import ConsultView from './views/ConsultView.vue';
import UpdateView from './views/UpdateView.vue';
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
]);
const tab = ref('consult');
const configured = computed(() => store.loaded && isConfigured());


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
  <header class="banner">
    <nav class="banner-inner">
      <div class="tabs" role="tablist">
        <button
          v-for="item in tabs"
          :key="item.id"
          type="button"
          role="tab"
          class="tab os-body-l"
          :class="{ active: item.id === tab }"
          :aria-selected="item.id === tab"
          @click="tab = item.id"
        >
          {{ item.label }}
        </button>
      </div>
      <!-- Hidden entry to the settings: invisible until hovered or focused (and shown while they are open). -->
      <button
        type="button"
        class="tab settings-link os-body-l"
        :class="{ active: tab === 'settings', visible: tab === 'settings' }"
        @click="tab = 'settings'"
      >
        {{ t('tab.settings') }}
      </button>
    </nav>
  </header>
  <main class="app">

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
      <ConsultView v-show="tab === 'consult'" :context="context" />
      <UpdateView v-show="tab === 'update'" :context="context" />
      <SettingsView v-if="tab === 'settings'" :context="context" />
    </template>
  </main>
</template>

<style scoped>
/* Blue banner of the OneStock design system (navy, fine diamond pattern), holding the tabs. */
.banner {
  background-color: #1b2152;
  background-image:
    repeating-linear-gradient(45deg, rgba(64, 96, 255, 0.28) 0 1px, transparent 1px 12px),
    repeating-linear-gradient(-45deg, rgba(64, 96, 255, 0.28) 0 1px, transparent 1px 12px);
}
.banner-inner {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  max-width: 1100px; margin: 0 auto; padding: 8px 16px;
}
.tabs { display: flex; flex-wrap: wrap; gap: 8px; }
.tab {
  display: flex; align-items: center; justify-content: center; min-height: 36px; padding: 8px 16px;
  border: none; border-radius: var(--os-radius); background: transparent; color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
}
.tab:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
.tab.active { background: rgba(255, 255, 255, 0.16); color: #fff; }
.tab:focus-visible { outline: 2px solid var(--os-primary-1000); outline-offset: 1px; }
.settings-link { opacity: 0; transition: opacity 0.2s; }
.settings-link:hover, .settings-link:focus-visible, .settings-link.visible { opacity: 1; }
.app { padding: 16px; max-width: 1100px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
</style>
