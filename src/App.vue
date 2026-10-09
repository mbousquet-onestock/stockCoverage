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
    <div class="banner-inner">
      <h1 class="title">{{ t('app.title') }}</h1>
      <nav class="tabs" role="tablist">
        <button
          v-for="item in tabs"
          :key="item.id"
          type="button"
          role="tab"
          class="tab"
          :class="{ active: item.id === tab }"
          :aria-selected="item.id === tab"
          @click="tab = item.id"
        >
          {{ item.label }}
        </button>
        <!-- Hidden entry to the settings: invisible until hovered or focused (and shown while they are open). -->
        <button
          type="button"
          role="tab"
          class="tab settings-link"
          :class="{ active: tab === 'settings' }"
          :aria-selected="tab === 'settings'"
          @click="tab = 'settings'"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M19.14 12.94a7.07 7.07 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7 7 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.59.24-1.13.56-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.12.22.39.3.61.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54c.05.24.25.42.49.42h3.84c.25 0 .45-.18.49-.42l.36-2.54c.59-.24 1.13-.56 1.63-.94l2.39.96c.22.08.49 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2Z"
            />
          </svg>
          {{ t('tab.settings') }}
        </button>
      </nav>
    </div>
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
/* Navy banner of the OneStock apps: title, then tabs underlined in white when active. */
.banner { background: #18244a; font-family: Roboto, sans-serif; }
.banner-inner { max-width: 1100px; margin: 0 auto; padding: 12px 16px 0; }
.title { margin: 0 0 14px; color: #fff; font-size: 1.25rem; font-weight: 500; line-height: 1.4; }
.tabs { display: flex; flex-wrap: wrap; gap: 4px; }
.tab {
  display: inline-flex; align-items: center; gap: 6px; height: 44px; padding: 0 14px;
  border: none; border-bottom: 3px solid transparent; background: none; color: #8f98b8;
  font-family: inherit; font-size: 0.9375rem; font-weight: 500; cursor: pointer;
}
.tab:hover { color: #fff; }
.tab.active { color: #fff; border-bottom-color: #fff; }
.tab:focus-visible { outline: 2px solid var(--os-primary-1000); outline-offset: -2px; }
.settings-link { opacity: 0; transition: opacity 0.2s; }
.settings-link:hover, .settings-link:focus-visible, .settings-link.active { opacity: 1; }
.app { padding: 16px; max-width: 1100px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
</style>
