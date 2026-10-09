import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiBaseUrl, isAllowedRoute, proxyRequest } from './onestock.js';

const config = { onestock: { token: 'tok', api_root: '', environment: 'qualif' } };

test('apiBaseUrl: setting, then context URL, then URL built from the site', () => {
  assert.equal(apiBaseUrl({ onestock: { api_root: 'https://x.test/v2/' } }, {}), 'https://x.test/v2');
  assert.equal(apiBaseUrl(config, { apiUrl: 'https://c00.api.qualif.onestock-retail.com' }), 'https://c00.api.qualif.onestock-retail.com/v3');
  assert.equal(apiBaseUrl({ onestock: { environment: 'prod' } }, { siteId: 'c01' }), 'https://c01.api.onestock-retail.com/v3');
});

test('only the stock coverage routes are relayed', () => {
  assert.ok(isAllowedRoute('GET', '/stock_coverages'));
  assert.ok(isAllowedRoute('POST', '/stock_coverages'));
  assert.ok(isAllowedRoute('POST', '/stock_coverage_imports/19176f60-ea9a-11ee/stock_coverages'));
  assert.ok(isAllowedRoute('PATCH', '/stock_coverage_imports/abc'));
  assert.ok(isAllowedRoute('PATCH', '/reset_stock_coverages'));
  assert.ok(isAllowedRoute('GET', '/items'));
  assert.ok(isAllowedRoute('GET', '/endpoints'));
  assert.ok(!isAllowedRoute('PATCH', '/items'));
  assert.ok(!isAllowedRoute('POST', '/endpoints'));
  assert.ok(!isAllowedRoute('GET', '/orders/ORD1'));
  assert.ok(!isAllowedRoute('DELETE', '/stock_coverages'));
  assert.ok(!isAllowedRoute('GET', '/stock_coverage_imports/../orders'));
  assert.ok(!isAllowedRoute('POST', '/login'));
});

test('proxyRequest adds site_id and token, and sends GET as POST + X-HTTP-Method-Override', async () => {
  let sent;
  globalThis.fetch = async (url, init) => {
    sent = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ stock_coverages: [] }));
  };
  const res = await proxyRequest(config, { siteId: 'c00' }, {
    method: 'GET',
    path: '/stock_coverages',
    body: { item_ids: ['i'], endpoint_ids: ['e'], site_id: 'other', token: 'forged' },
  });
  assert.equal(res.status, 200);
  assert.equal(sent.url, 'https://c00.api.qualif.onestock-retail.com/v3/stock_coverages');
  assert.equal(sent.init.method, 'POST');
  assert.equal(sent.init.headers['X-HTTP-Method-Override'], 'GET');
  assert.deepEqual(sent.body, { item_ids: ['i'], endpoint_ids: ['e'], site_id: 'c00', token: 'tok' });
});

test('proxyRequest refuses other routes and a missing token', async () => {
  await assert.rejects(proxyRequest(config, { siteId: 'c00' }, { method: 'GET', path: '/orders/1' }), /non exposée/);
  await assert.rejects(
    proxyRequest({ onestock: { token: '' } }, { siteId: 'c00' }, { method: 'GET', path: '/stock_coverages' }),
    /onestock_token absent/,
  );
});
