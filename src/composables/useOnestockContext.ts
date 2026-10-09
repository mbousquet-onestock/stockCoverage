import { reactive, onMounted, onBeforeUnmount } from 'vue';

/**
 * OneStock UI extension context (see "UI Extensibility - How to develop UI Extensions"):
 * URL parameters + `extension_ready` / `onestock_data` handshake. The signature is not verified.
 */
export interface OnestockContext {
  embedded: boolean;
  ready: boolean;
  extensionId: string;
  userId: string;
  siteId: string;
  lang: string;
  hostApp: string;
  apiUrl: string;
  /** Items / stock locations of the page the extension is opened from (pre-fill the search), if any. */
  itemIds: string[];
  endpointIds: string[];
  /** Optional ?environment= (qualif, prod…); otherwise deduced server side from api_url. */
  environment: string;
  parentOrigin: string;
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '*';
  }
}

/** `item_id` / `item_ids` (list or comma separated string) of the context. */
function idsOf(single: unknown, list: unknown): string[] {
  const values = [single, ...(Array.isArray(list) ? list : String(list || '').split(','))];
  return [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))];
}

export function useOnestockContext() {
  const params = new URLSearchParams(window.location.search);
  const embedded = window.parent !== window;
  const context = reactive<OnestockContext>({
    embedded,
    ready: !embedded,
    extensionId: params.get('extension_id') || '',
    userId: params.get('user_id') || '',
    siteId: params.get('site_id') || '',
    lang: params.get('lang') || 'fr',
    hostApp: params.get('host_app') || '',
    apiUrl: params.get('api_url') || '',
    // Outside of OneStock, ?item_ids= / ?endpoint_ids= (and ?api_url=) can be used to test the page.
    itemIds: idsOf(params.get('item_id'), params.get('item_ids')),
    endpointIds: idsOf(params.get('endpoint_id'), params.get('endpoint_ids')),
    environment: params.get('environment') || '',
    parentOrigin: originOf(params.get('parent_url') || ''),
  });

  function post(message: Record<string, unknown>) {
    if (embedded) window.parent.postMessage(message, context.parentOrigin);
  }

  function onMessage(event: MessageEvent) {
    if (context.parentOrigin !== '*' && event.origin !== context.parentOrigin) return;
    if (!event.data || typeof event.data !== 'object' || event.data.type !== 'onestock_data') return;
    const data = event.data.data || {};
    context.apiUrl = data.api_url || context.apiUrl;
    context.siteId = data.site_id || context.siteId;
    context.userId = data.user_id || context.userId;
    context.extensionId = data.extension_id || context.extensionId;
    context.lang = data.lang || context.lang;
    const itemIds = idsOf(data.item_id, data.item_ids);
    const endpointIds = idsOf(data.endpoint_id, data.endpoint_ids);
    if (itemIds.length) context.itemIds = itemIds;
    if (endpointIds.length) context.endpointIds = endpointIds;
    context.ready = true;
  }

  let observer: ResizeObserver | undefined;
  onMounted(() => {
    window.addEventListener('message', onMessage);
    post({ type: 'extension_ready' });
    // Back office iframes follow the page height.
    observer = new ResizeObserver(() => {
      const height = Math.ceil(document.documentElement.scrollHeight);
      if (height > 0) post({ type: 'extension_resize', height });
    });
    observer.observe(document.body);
  });
  onBeforeUnmount(() => {
    window.removeEventListener('message', onMessage);
    observer?.disconnect();
  });

  return {
    context,
    close: () => post({ type: 'extension_close' }),
  };
}
