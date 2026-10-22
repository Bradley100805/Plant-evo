import type { Table } from './experiments.ts';

/** RFC 4180 CSV. Numbers are written with full precision; NaN becomes an empty field. */
export function tableToCsv(table: Table): string {
  const lines = [table.columns.map(escapeField).join(',')];
  for (const row of table.rows) lines.push(row.map(formatNumber).join(','));
  return lines.join('\n') + '\n';
}

function formatNumber(x: number): string {
  return Number.isNaN(x) ? '' : String(x);
}

function escapeField(field: string): string {
  return /[",\n\r]/.test(field) ? `"${field.replaceAll('"', '""')}"` : field;
}
