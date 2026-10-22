import type { ReactNode } from 'react';

export interface LegendItem {
  label: string;
  color: string;
}

/** Legend with line keys (mirrors the line marks it describes). */
export function Legend({ items }: { items: readonly LegendItem[] }) {
  return (
    <ul className="legend">
      {items.map((item) => (
        <li key={item.label}>
          <span className="line-key" style={{ background: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function ChartCard({
  title,
  subtitle,
  stale,
  children,
}: {
  title: string;
  subtitle?: string;
  stale?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={stale ? 'card stale' : 'card'} aria-busy={stale}>
      <h3>{title}</h3>
      {subtitle !== undefined && <p className="subtitle">{subtitle}</p>}
      {children}
    </section>
  );
}

export function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {note !== undefined && <div className="note">{note}</div>}
    </div>
  );
}

/** Table view of chart data: every value is reachable without hovering. */
export function DataTable({
  columns,
  rows,
  className,
}: {
  columns: readonly string[];
  rows: readonly (readonly (string | number)[])[];
  /** 'text' left-aligns every column, for tables of words rather than numbers. */
  className?: 'text';
}) {
  return (
    <div className={className === undefined ? 'table-wrap' : `table-wrap ${className}`}>
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
