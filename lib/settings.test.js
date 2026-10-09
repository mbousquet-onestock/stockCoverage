import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { scopeOf, readSettings, readOrInitializeSettings, writeSettings, publicSettings, clearSettingsCache } from './settings.js';

let rows;
let calls;

beforeEach(() => {
  clearSettingsCache();
  process.env.SETTINGS_API_KEY = 'k';
  calls = [];
  rows = [
    { key: 'onestock_token', site_id: '', extension_id: '*', environment: 'qualif', value: 'global-token' },
    { key: 'default_endpoint_ids', site_id: 'c00', extension_id: 'stock-coverage', environment: 'qualif', value: 'main_MC' },
  ];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const body = init.body && JSON.parse(init.body);
    calls.push({ method: init.method, url: u, body });
    const q = Object.fromEntries(u.searchParams);
    if (init.method === 'PUT') return new Response(JSON.stringify({ setting: {} }));
    if (init.method === 'POST') {
      rows.push(...[].concat(body));
      return new Response(JSON.stringify({ settings: body }), { status: 201 });
    }
    const settings = rows
      .filter((r) => r.site_id === q.site_id && r.environment === q.environment)
      .map((r) => ({ ...r, value: r.key.includes('token') && q.decrypt !== '1' ? null : r.value }));
    return new Response(JSON.stringify({ settings, count: settings.length }));
  };
});

const scope = () => scopeOf({ site_id: 'c00', extension_id: 'stock-coverage', environment: 'qualif' });

test('reads the global token and the extension values of the site', async () => {
  const s = await readSettings(scope(), { decrypt: true });
  assert.equal(s.onestock_token.value, 'global-token');
  assert.equal(s.default_endpoint_ids.value, 'main_MC');
  assert.equal(s.period_label.value, 'semaine');
  assert.equal(publicSettings(s).onestock_token.value, '');
  assert.equal(publicSettings(s).onestock_token.set, true);
});

test('first connection creates the missing non-secret keys only', async () => {
  const { created } = await readOrInitializeSettings(scopeOf({ site_id: 'c00', extension_id: 'stock-coverage', environment: 'qualif', api_url: 'https://c00.api.qualif.onestock-retail.com' }));
  assert.deepEqual(created.sort(), ['onestock_api_root', 'period_label']);
  const root = rows.find((r) => r.key === 'onestock_api_root');
  assert.deepEqual([root.site_id, root.extension_id, root.value], ['c00', '*', 'https://c00.api.qualif.onestock-retail.com']);
});

test('the token typed in the settings is written for the site and every extension; empty keeps it', async () => {
  const saved = await writeSettings(scope(), { onestock_token: 'new', period_label: 'jour', unknown: 'x' });
  assert.deepEqual(saved, ['onestock_token', 'period_label']);
  const token = calls.find((c) => c.method === 'PUT' && c.url.searchParams.get('key') === 'onestock_token');
  assert.equal(token.url.searchParams.get('site_id'), 'c00');
  assert.equal(token.url.searchParams.get('extension_id'), '*');
  assert.equal(token.url.searchParams.get('upsert'), '1');
  assert.deepEqual(token.body, { value: 'new' });
  assert.deepEqual(await writeSettings(scope(), { onestock_token: '' }), []);
});
