<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { OsAlert, OsBadge, OsButton, OsCardLayout, OsDivider, OsInputText } from '#ds';
import type { OnestockContext } from '../composables/useOnestockContext';
import { store, loadSettings, saveSettings } from '../settings';
import { onestock } from '../api';
import { t } from '../i18n';

const props = defineProps<{ context: OnestockContext }>();

const form = reactive<Record<string, string>>({});
const initial = ref<Record<string, string>>({});
const message = ref<{ type: 'success' | 'danger'; text: string } | null>(null);
const saving = ref(false);
const testing = ref(false);

const siteLabel = computed(() =>
  store.scope?.siteId ? t('settings.thisSite', { site: store.scope.siteId }) : t('settings.allSites'),
);
const extensionId = computed(() => store.scope?.extensionId || props.context.extensionId);

function fill() {
  const values = Object.fromEntries(Object.entries(store.settings).map(([key, s]) => [key, s.value]));
  Object.assign(form, values);
  initial.value = values;
}
watch(() => store.settings, fill, { immediate: true });

function origin(key: string) {
  const s = store.settings[key];
  if (!s?.source) return t('settings.default');
  const site = s.source.site_id ? t('settings.thisSite', { site: s.source.site_id }) : t('settings.allSites');
  const extension =
    s.source.extension_id === '*' ? t('settings.allExtensions') : t('settings.extension', { extension: s.source.extension_id });
  const env =
    s.source.environment && s.source.environment !== store.scope?.environment
      ? t('settings.fromEnv', { env: s.source.environment })
      : '';
  return t('settings.origin', { site, extension, env });
}

const tokenText = computed(() => {
  const token = store.settings.onestock_token;
  if (token?.error) return token.error;
  if (!token?.set) return t('settings.tokenAbsent', { env: store.scope?.environment ?? '?' });
  return t('settings.tokenReplace', { origin: origin('onestock_token'), site: siteLabel.value });
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
      text: saved.length ? t('settings.saved', { n: saved.length }) : t('settings.nothing'),
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
    message.value = { type: 'success', text: t('settings.testOk') };
  } catch (err) {
    message.value = { type: 'danger', text: t('settings.testError', { message: (err as Error).message }) };
  } finally {
    testing.value = false;
  }
}
</script>

<template>
  <section class="settings">
    <div class="head">
      <h1 class="os-title-m title">{{ t('settings.title') }}</h1>
      <OsBadge v-if="store.scope" :text="t('settings.environment', { env: store.scope.environment })" color="grey" />
    </div>

    <OsAlert v-if="store.error" type="danger" title="API Settings" :subtitle="store.error">
      <template #actions>
        <OsButton type="secondary" :text="t('common.retry')" @click="loadSettings(context)" />
      </template>
    </OsAlert>
    <OsAlert v-else-if="store.loading && !store.loaded" type="neutral" :subtitle="t('settings.loading')" />

    <OsCardLayout v-if="store.loaded">
      <div class="group">
        <div class="os-label-l">{{ t('settings.connection') }}</div>
        <span class="os-body-s hint">{{ t('settings.connectionHint', { site: siteLabel }) }}</span>
        <div class="token">
          <OsInputText
            v-model="form.onestock_token"
            :label="t('settings.token')"
            type="password"
            autocomplete="off"
            :placeholder="store.settings.onestock_token?.set ? t('settings.tokenKeep') : t('settings.tokenPlaceholder')"
            :supporting-text="tokenText"
          />
          <OsBadge
            :text="store.settings.onestock_token?.set ? t('settings.present') : t('settings.absent')"
            :color="store.settings.onestock_token?.set ? 'green' : 'red'"
          />
        </div>
        <OsInputText
          v-model="form.onestock_api_root"
          :label="t('settings.apiRoot')"
          :placeholder="context.apiUrl || 'https://c00.api.qualif.onestock-retail.com'"
          :supporting-text="t('settings.apiRootHint', { origin: origin('onestock_api_root') })"
        />

        <OsDivider />

        <div class="os-label-l">{{ t('settings.coverage') }}</div>
        <span class="os-body-s hint">{{ t('settings.extensionHint', { extension: extensionId, site: siteLabel }) }}</span>
        <OsInputText
          v-model="form.default_endpoint_ids"
          :label="t('settings.defaultEndpoints')"
          placeholder="store_1, warehouse_2"
          :supporting-text="t('settings.defaultEndpointsHint', { origin: origin('default_endpoint_ids') })"
        />
        <OsInputText
          v-model="form.period_label"
          :label="t('settings.periodLabel')"
          :placeholder="t('settings.periodPlaceholder')"
          :supporting-text="t('settings.periodLabelHint', { origin: origin('period_label') })"
        />

        <OsAlert v-if="message" :type="message.type" :subtitle="message.text" />

        <div class="actions">
          <OsButton type="secondary" :text="t('settings.test')" :pending="testing" @click="testConnection" />
          <OsButton :text="t('common.save')" :pending="saving" @click="save" />
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
