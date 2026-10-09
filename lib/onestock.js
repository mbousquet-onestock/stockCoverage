export class OnestockError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PATCH']);

/**
 * Routes the proxy relays: the stock coverage API only (the token gives access to the whole site).
 * GET/POST /stock_coverages, GET/POST /stock_coverage_imports, GET/PATCH /stock_coverage_imports/{id},
 * POST /stock_coverage_imports/{id}/stock_coverages, PATCH /reset_stock_coverages.
 */
const ALLOWED_ROUTES = [
  { methods: ['GET', 'POST'], pattern: /^\/stock_coverages$/ },
  { methods: ['GET', 'POST'], pattern: /^\/stock_coverage_imports$/ },
  { methods: ['GET', 'PATCH'], pattern: /^\/stock_coverage_imports\/[\w.:-]+$/ },
  { methods: ['POST'], pattern: /^\/stock_coverage_imports\/[\w.:-]+\/stock_coverages$/ },
  { methods: ['PATCH'], pattern: /^\/reset_stock_coverages$/ },
];

export function isAllowedRoute(method, path) {
  return ALLOWED_ROUTES.some((route) => route.methods.includes(method) && route.pattern.test(path));
}

/**
 * Base URL of the OneStock API, version included.
 * Priority: onestock_api_root setting > api_url received from the extension context > URL built from the site id.
 * When the root has no version (/v1…/v4), /v3 is added.
 */
export function apiBaseUrl(config, { apiUrl, siteId }) {
  const { api_root, environment } = config.onestock;
  let base = api_root || apiUrl;
  if (!base) {
    if (!siteId) throw new OnestockError("site_id manquant pour construire l'URL de l'API", 400);
    const host = ['prod', 'production'].includes(environment)
      ? 'api.onestock-retail.com'
      : `api.${environment || 'qualif'}.onestock-retail.com`;
    base = `https://${siteId}.${host}`;
  }
  base = base.replace(/\/+$/, '');
  return /\/v\d+$/.test(base) ? base : `${base}/v3`;
}

async function call(method, url, body) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  let httpMethod = method;
  // OneStock GET routes take a JSON body: POST + X-HTTP-Method-Override is the documented transport.
  if (method === 'GET') {
    httpMethod = 'POST';
    headers['X-HTTP-Method-Override'] = 'GET';
  }
  const res = await fetch(url, { method: httpMethod, headers, body: JSON.stringify(body) });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { status: res.status, ok: res.ok, data };
}

function getToken(config) {
  if (config.onestock.token_error) throw new OnestockError(config.onestock.token_error, 500);
  if (!config.onestock.token) {
    throw new OnestockError("onestock_token absent : le saisir dans l'onglet Paramètres", 400);
  }
  return config.onestock.token;
}

/**
 * Forwards a call to the OneStock API, adding `site_id` and the token to the body.
 * Returns `{ status, ok, data }` as received from OneStock.
 */
export async function proxyRequest(settings, ctx, { method = 'GET', path, body = {} }) {
  method = String(method).toUpperCase();
  if (!ALLOWED_METHODS.has(method)) throw new OnestockError(`Méthode ${method} non supportée`, 400);
  if (!ctx.siteId) throw new OnestockError('site_id manquant', 400);
  if (typeof path !== 'string' || !isAllowedRoute(method, path)) {
    throw new OnestockError(`Route OneStock non exposée par le proxy : ${method} ${path}`, 400);
  }

  const url = `${apiBaseUrl(settings, ctx)}${path}`;
  const payload = { ...body, site_id: ctx.siteId };
  return call(method, url, { ...payload, token: getToken(settings) });
}
