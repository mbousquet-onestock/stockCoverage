import { requestContext } from './settings';
import type { OnestockContext } from './composables/useOnestockContext';
import { chunk, itemName, matchEndpoints, READ_BATCH_SIZE, uploadPlan } from '#lib/coverage.js';

export interface Coverage {
  item_id: string;
  endpoint_id: string;
  sales_per_period: number;
  assortment: boolean;
}

export type ImportStatus = 'open' | 'closed' | 'completed' | 'timed_out';

export interface CoverageImport {
  id: string;
  status: ImportStatus;
  created_at?: number;
  completed_at?: number;
  received_batches?: number;
  completed_batches?: number;
  last_batch_received_at?: number;
  user_id?: string;
  details?: {
    received_stock_coverages?: number;
    imported_stock_coverages?: number;
    invalid_stock_coverages?: number;
    sent_import_error?: number;
  };
}

async function post<T>(url: string, context: OnestockContext, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, context: requestContext(context) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data.error || data.message || data.raw || `Erreur HTTP ${res.status}`;
    throw Object.assign(new Error(typeof message === 'string' ? message : JSON.stringify(message)), {
      status: res.status,
      details: data,
    });
  }
  return data as T;
}

/** Every OneStock API call goes through the Vercel proxy (api/onestock-proxy.js). */
export function onestock<T>(context: OnestockContext, method: string, path: string, body: Record<string, unknown> = {}) {
  return post<T>('/api/onestock-proxy', context, { method, path, body });
}

/** GET /stock_coverages (both lists are required by OneStock), by batches of item ids. */
export async function readCoverages(context: OnestockContext, itemIds: string[], endpointIds: string[]) {
  const results = await Promise.all(
    chunk(itemIds, READ_BATCH_SIZE).map((item_ids: string[]) =>
      onestock<{ stock_coverages?: Coverage[] }>(context, 'GET', '/stock_coverages', {
        item_ids,
        endpoint_ids: endpointIds,
      }),
    ),
  );
  return results.flatMap((r) => r.stock_coverages || []);
}

export interface UploadProgress {
  mode: 'sync' | 'async';
  sent: number;
  total: number;
  importId?: string;
}

/**
 * Sends coverages: POST /stock_coverages up to 100 lines; above, asynchronous import
 * (create, send the batches, close). Returns the import id in asynchronous mode.
 */
export async function uploadCoverages(
  context: OnestockContext,
  coverages: Coverage[],
  onProgress: (progress: UploadProgress) => void = () => {},
): Promise<{ mode: 'sync' | 'async'; importId?: string }> {
  const plan = uploadPlan(coverages);
  const total = coverages.length;
  if (plan.mode === 'sync') {
    onProgress({ mode: 'sync', sent: 0, total });
    await onestock(context, 'POST', '/stock_coverages', { stock_coverages: coverages });
    onProgress({ mode: 'sync', sent: total, total });
    return { mode: 'sync' };
  }

  const created = await onestock<{ stock_coverage_import?: { id?: string } }>(context, 'POST', '/stock_coverage_imports', {
    stock_coverage_import: {},
  });
  const importId = created.stock_coverage_import?.id;
  if (!importId) throw new Error("OneStock n'a pas renvoyé d'identifiant d'import");
  const path = `/stock_coverage_imports/${encodeURIComponent(importId)}`;
  let sent = 0;
  onProgress({ mode: 'async', sent, total, importId });
  for (const batch of plan.batches as Coverage[][]) {
    await onestock(context, 'POST', `${path}/stock_coverages`, { stock_coverages: batch });
    sent += batch.length;
    onProgress({ mode: 'async', sent, total, importId });
  }
  await onestock(context, 'PATCH', path, { stock_coverage_import: { status: 'closed' } });
  return { mode: 'async', importId };
}

export async function listImports(context: OnestockContext, { status = '', start = 0, limit = 20 } = {}) {
  const data = await onestock<{ stock_coverage_imports?: CoverageImport[] }>(context, 'GET', '/stock_coverage_imports', {
    ...(status ? { filter: { status } } : {}),
    pagination: { start, limit },
  });
  return data.stock_coverage_imports || [];
}

export async function getImport(context: OnestockContext, id: string) {
  const data = await onestock<{ stock_coverage_import?: CoverageImport }>(
    context,
    'GET',
    `/stock_coverage_imports/${encodeURIComponent(id)}`,
  );
  return data.stock_coverage_import ?? null;
}

/** PATCH /reset_stock_coverages: deletes every coverage created at or before `before` (unix timestamp). */
export function resetCoverages(context: OnestockContext, before: number) {
  return onestock(context, 'PATCH', '/reset_stock_coverages', { before });
}

/** A search suggestion: the id to add, with what helps recognise it. */
export interface Suggestion {
  id: string;
  label?: string;
  detail?: string;
}

/** Items whose indexed fields (id, name, EAN… depending on the site) contain the text: GET /items `pattern`. */
export async function searchItems(context: OnestockContext, pattern: string, limit = 10): Promise<Suggestion[]> {
  const lang = (context.lang || 'fr').slice(0, 2);
  const data = await onestock<{ items?: { id: string; product_id?: string; features?: Record<string, unknown> }[] }>(
    context,
    'GET',
    '/items',
    { pattern, features: ['name'], fields: ['product_id'], lang, pagination: { start: 0, limit } },
  );
  return (data.items || []).map((item) => ({
    id: item.id,
    label: itemName(item, lang),
    detail: item.product_id && item.product_id !== item.id ? item.product_id : undefined,
  }));
}

interface Endpoint {
  id: string;
  name?: string;
  address?: { city?: string };
}

const ENDPOINTS_PAGE = 500;
const ENDPOINTS_MAX = 10000;
const endpointsCache = new Map<string, Promise<Endpoint[]>>();

/**
 * Every stock location of the site (GET /endpoints, by pages), loaded once per site and kept in memory:
 * GET /endpoints has no text search, the matching is done in the browser.
 */
function allEndpoints(context: OnestockContext) {
  const key = `${context.siteId}|${context.apiUrl}`;
  let cached = endpointsCache.get(key);
  if (!cached) {
    cached = (async () => {
      const endpoints: Endpoint[] = [];
      for (let start = 0; start < ENDPOINTS_MAX; start += ENDPOINTS_PAGE) {
        const data = await onestock<{ endpoints?: Endpoint[] }>(context, 'GET', '/endpoints', {
          fields: ['_id', 'name', 'address.city'],
          pagination: { start, limit: ENDPOINTS_PAGE },
        });
        const page = data.endpoints || [];
        endpoints.push(...page);
        if (page.length < ENDPOINTS_PAGE) break;
      }
      return endpoints;
    })();
    // A failure (token not set yet…) is not kept: the next search tries again.
    cached.catch(() => endpointsCache.delete(key));
    endpointsCache.set(key, cached);
  }
  return cached;
}

export async function searchEndpoints(context: OnestockContext, text: string, limit = 10): Promise<Suggestion[]> {
  return (matchEndpoints(await allEndpoints(context), text, limit) as Endpoint[]).map((e) => ({
    id: e.id,
    label: e.name,
    detail: e.address?.city,
  }));
}

export function formatDate(timestamp: number | undefined, lang = 'fr') {
  return timestamp ? new Date(timestamp * 1000).toLocaleString(lang) : '';
}
