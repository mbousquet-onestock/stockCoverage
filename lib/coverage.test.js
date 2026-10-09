import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIds,
  parseCoveragesCsv,
  normalizeCoverage,
  coveragesToCsv,
  missingPairs,
  uploadPlan,
  endOfDayTimestamp,
} from './coverage.js';

test('parseIds splits on lines, commas, semicolons and spaces, without duplicates', () => {
  assert.deepEqual(parseIds('a, b;c\n d\ta\n\n'), ['a', 'b', 'c', 'd']);
  assert.deepEqual(parseIds(''), []);
});

test('normalizeCoverage checks ids, sales and assortment', () => {
  assert.deepEqual(normalizeCoverage({ item_id: ' i1 ', endpoint_id: 'e1', sales_per_period: '2,5', assortment: '' }), {
    coverage: { item_id: 'i1', endpoint_id: 'e1', sales_per_period: 2.5, assortment: true },
  });
  assert.equal(normalizeCoverage({ item_id: 'i1', endpoint_id: 'e1', sales_per_period: 0, assortment: 'non' }).coverage.assortment, false);
  assert.deepEqual(normalizeCoverage({ endpoint_id: 'e1', sales_per_period: 1 }).error, { code: 'item_id_missing' });
  assert.deepEqual(normalizeCoverage({ item_id: 'i', endpoint_id: 'e', sales_per_period: '-3' }).error, { code: 'sales_invalid', value: '-3' });
  assert.equal(normalizeCoverage({ item_id: 'i', endpoint_id: 'e', sales_per_period: '' }).error.code, 'sales_invalid');
  assert.deepEqual(normalizeCoverage({ item_id: 'i', endpoint_id: 'e', sales_per_period: 1, assortment: 'peut-être' }).error, { code: 'assortment_invalid', value: 'peut-être' });
});

test('parseCoveragesCsv reads files without header, keeping the last duplicate', () => {
  const { coverages, errors } = parseCoveragesCsv('i1;e1;10;true\ni2;e1;3\ni1;e1;12;false\ni3;;4\n');
  assert.deepEqual(coverages, [
    { item_id: 'i2', endpoint_id: 'e1', sales_per_period: 3, assortment: true },
    { item_id: 'i1', endpoint_id: 'e1', sales_per_period: 12, assortment: false },
  ]);
  assert.deepEqual(errors, [{ line: 4, code: 'endpoint_id_missing' }]);
});

test('parseCoveragesCsv uses the header order, the comma separator and quotes', () => {
  const csv = '﻿endpoint_id,sales_per_period,item_id\r\nmain_MC,"1,5",ITEM 1\r\n';
  assert.deepEqual(parseCoveragesCsv(csv).coverages, [
    { item_id: 'ITEM 1', endpoint_id: 'main_MC', sales_per_period: 1.5, assortment: true },
  ]);
  assert.deepEqual(parseCoveragesCsv('item_id;endpoint_id\na;b').errors[0], { line: 1, code: 'columns_missing', value: 'sales_per_period' });
});

test('coveragesToCsv round-trips through parseCoveragesCsv', () => {
  const coverages = [{ item_id: 'a;b', endpoint_id: 'e', sales_per_period: 7, assortment: false }];
  assert.deepEqual(parseCoveragesCsv(coveragesToCsv(coverages)).coverages, coverages);
});

test('missingPairs lists the asked pairs without coverage', () => {
  const found = [{ item_id: 'i1', endpoint_id: 'e1' }];
  assert.deepEqual(missingPairs(['i1', 'i2'], ['e1'], found), [{ item_id: 'i2', endpoint_id: 'e1' }]);
});

test('uploadPlan sends up to 100 lines directly, more as an asynchronous import by batches of 100', () => {
  const lines = (n) => Array.from({ length: n }, (_, i) => ({ item_id: `i${i}` }));
  assert.equal(uploadPlan(lines(100)).mode, 'sync');
  const plan = uploadPlan(lines(250));
  assert.equal(plan.mode, 'async');
  assert.deepEqual(plan.batches.map((b) => b.length), [100, 100, 50]);
});

test('endOfDayTimestamp gives the last second of the local day', () => {
  const ts = endOfDayTimestamp('2024-03-21');
  const d = new Date(ts * 1000);
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()], [2024, 2, 21, 23, 59]);
  assert.equal(endOfDayTimestamp('21/03/2024'), null);
});
