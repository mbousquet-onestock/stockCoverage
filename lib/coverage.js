/**
 * Pure helpers for stock coverages (shared by the browser and the tests).
 * A stock coverage is `{ item_id, endpoint_id, sales_per_period, assortment }` (OneStock /stock_coverages).
 */

/** POST /stock_coverages takes at most 100 lines: above, the asynchronous import API is used. */
export const MAX_SYNC_COVERAGES = 100;
/** Lines per batch of an asynchronous import (POST /stock_coverage_imports/{id}/stock_coverages). */
export const IMPORT_BATCH_SIZE = 100;
/** Item ids per GET /stock_coverages call. */
export const READ_BATCH_SIZE = 100;

export const COLUMNS = ['item_id', 'endpoint_id', 'sales_per_period', 'assortment'];

/** Ids typed by the user: one per line, or separated by commas, semicolons or spaces. Duplicates removed. */
export function parseIds(text) {
  return [
    ...new Set(
      String(text ?? '')
        .split(/[\s,;]+/)
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
}

export function chunk(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  return chunks;
}

export function coverageKey({ item_id, endpoint_id }) {
  return `${item_id}\u0000${endpoint_id}`;
}

const TRUE_VALUES = ['true', '1', 'oui', 'yes', 'y', 'o', 'vrai', 'x'];
const FALSE_VALUES = ['false', '0', 'non', 'no', 'n', 'faux'];

/** assortment column: empty means true (item in the assortment). Returns null when unreadable. */
export function parseBoolean(value, fallback = true) {
  if (typeof value === 'boolean') return value;
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return fallback;
  if (TRUE_VALUES.includes(text)) return true;
  if (FALSE_VALUES.includes(text)) return false;
  return null;
}

/** sales_per_period: decimal comma accepted. Returns null when not a positive (or zero) number. */
export function parseSales(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  const text = String(value ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (!text || !/^\d*\.?\d+$/.test(text)) return null;
  return Number(text);
}

/** Checks and normalises one line. Returns `{ coverage }` or `{ error }`. */
export function normalizeCoverage(raw) {
  const item_id = String(raw?.item_id ?? '').trim();
  const endpoint_id = String(raw?.endpoint_id ?? '').trim();
  if (!item_id) return { error: 'item_id manquant' };
  if (!endpoint_id) return { error: 'endpoint_id manquant' };
  const sales = parseSales(raw.sales_per_period);
  if (sales === null) return { error: `sales_per_period invalide (« ${raw.sales_per_period ?? ''} »)` };
  const assortment = parseBoolean(raw.assortment);
  if (assortment === null) return { error: `assortment invalide (« ${raw.assortment} ») : true / false attendu` };
  return { coverage: { item_id, endpoint_id, sales_per_period: sales, assortment } };
}

function detectSeparator(line) {
  const counts = [';', '\t', ','].map((sep) => [sep, line.split(sep).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ';';
}

function splitLine(line, sep) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      cells.push(cell);
      cell = '';
    } else cell += c;
  }
  cells.push(cell);
  return cells.map((v) => v.trim());
}

/**
 * Reads a CSV (separator ; , or tab, detected on the first line). Columns item_id, endpoint_id,
 * sales_per_period, assortment: in this order without header, in any order with a header line.
 * The same item / endpoint pair appearing twice keeps the last line.
 * Returns `{ coverages, errors: [{ line, message }] }`.
 */
export function parseCoveragesCsv(text) {
  const lines = String(text ?? '')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((line, i) => ({ line: i + 1, text: line }))
    .filter((l) => l.text.trim());
  if (!lines.length) return { coverages: [], errors: [] };

  const sep = detectSeparator(lines[0].text);
  let columns = COLUMNS;
  const first = splitLine(lines[0].text, sep).map((c) => c.toLowerCase());
  if (first.includes('item_id') || first.includes('endpoint_id')) {
    columns = first;
    lines.shift();
    const missing = ['item_id', 'endpoint_id', 'sales_per_period'].filter((c) => !columns.includes(c));
    if (missing.length) return { coverages: [], errors: [{ line: 1, message: `Colonnes manquantes : ${missing.join(', ')}` }] };
  }

  const byKey = new Map();
  const errors = [];
  for (const { line, text: content } of lines) {
    const cells = splitLine(content, sep);
    const raw = Object.fromEntries(columns.map((name, i) => [name, cells[i]]));
    const { coverage, error } = normalizeCoverage(raw);
    if (error) errors.push({ line, message: error });
    else {
      byKey.delete(coverageKey(coverage));
      byKey.set(coverageKey(coverage), coverage);
    }
  }
  return { coverages: [...byKey.values()], errors };
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function coveragesToCsv(coverages) {
  return [COLUMNS.join(';'), ...coverages.map((c) => COLUMNS.map((name) => csvCell(c[name])).join(';'))].join('\n');
}

/** Pairs item / endpoint asked for that OneStock returned no coverage for. */
export function missingPairs(itemIds, endpointIds, coverages) {
  const found = new Set(coverages.map(coverageKey));
  const missing = [];
  for (const item_id of itemIds) {
    for (const endpoint_id of endpointIds) {
      if (!found.has(coverageKey({ item_id, endpoint_id }))) missing.push({ item_id, endpoint_id });
    }
  }
  return missing;
}

/** Sync POST for up to 100 lines, asynchronous import (in batches) above. */
export function uploadPlan(coverages) {
  if (coverages.length <= MAX_SYNC_COVERAGES) return { mode: 'sync', batches: [coverages] };
  return { mode: 'async', batches: chunk(coverages, IMPORT_BATCH_SIZE) };
}

/** Unix timestamp (seconds) at the end of a local day `YYYY-MM-DD`, for PATCH /reset_stock_coverages. */
export function endOfDayTimestamp(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ''));
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59);
  return Math.floor(d.getTime() / 1000);
}
