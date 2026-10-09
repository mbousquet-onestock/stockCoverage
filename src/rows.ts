import type { Coverage } from './api';
import { normalizeCoverage } from '#lib/coverage.js';

/** A line of the editable table: sales_per_period is kept as typed until it is sent. */
export interface EditableRow {
  uid: number;
  item_id: string;
  endpoint_id: string;
  sales: string;
  assortment: boolean;
  /** Coverage currently known by OneStock (null: none, or a new line). */
  original: Coverage | null;
}

let nextUid = 1;

export function rowOf(coverage: Partial<Coverage> & { item_id: string; endpoint_id: string }, original: Coverage | null = null): EditableRow {
  return {
    uid: nextUid++,
    item_id: coverage.item_id,
    endpoint_id: coverage.endpoint_id,
    sales: coverage.sales_per_period === undefined ? '' : String(coverage.sales_per_period),
    assortment: coverage.assortment ?? true,
    original,
  };
}

export function rowCoverage(row: EditableRow): { coverage?: Coverage; error?: { code: string; value?: string } } {
  return normalizeCoverage({
    item_id: row.item_id,
    endpoint_id: row.endpoint_id,
    sales_per_period: row.sales,
    assortment: row.assortment,
  });
}

/** Changed compared to OneStock (a line without coverage is changed as soon as sales are typed). */
export function isDirty(row: EditableRow) {
  const { coverage } = rowCoverage(row);
  if (!row.original) return row.sales.trim() !== '';
  if (!coverage) return true;
  return (
    coverage.item_id !== row.original.item_id ||
    coverage.endpoint_id !== row.original.endpoint_id ||
    coverage.sales_per_period !== Number(row.original.sales_per_period) ||
    coverage.assortment !== (row.original.assortment ?? true)
  );
}
