import { tableToCsv, type Table } from '@plant-evo/sim';

export function percent(x: number, digits = 1): string {
  return Number.isFinite(x) ? `${(x * 100).toFixed(digits)}%` : '—';
}

export function fixed(x: number, digits = 3): string {
  return Number.isFinite(x) ? x.toFixed(digits) : '—';
}

export function downloadCsv(filename: string, table: Table): void {
  const url = URL.createObjectURL(new Blob([tableToCsv(table)], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
