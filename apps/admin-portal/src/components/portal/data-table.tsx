'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Render cell content for a given row */
  render: (row: T) => ReactNode;
  /** Tailwind width utility (e.g. "w-40", "w-[120px]") */
  width?: string;
  /** Additional cell class, e.g. "text-right font-mono" */
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getKey: (row: T) => string | number;
  /** Navigate on row click */
  onRowHref?: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  getKey,
  onRowHref,
  onRowClick,
  emptyMessage = 'No results.',
  className = '',
}: DataTableProps<T>) {
  const router = useRouter();

  if (rows.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="type-body italic text-[var(--text-muted)]">{emptyMessage}</p>
      </div>
    );
  }

  const handleRowClick = (row: T) => {
    if (onRowClick) return onRowClick(row);
    if (onRowHref) router.push(onRowHref(row) as any);
  };

  const clickable = !!(onRowClick || onRowHref);

  return (
    <div className={`w-full overflow-x-auto ${className}`}>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[var(--border-default)]">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`type-meta-small px-4 py-3 text-left align-middle first:pl-0 last:pr-0 ${col.width ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={getKey(row)}
              onClick={clickable ? () => handleRowClick(row) : undefined}
              className={`border-b border-[var(--border-subtle)] transition-colors ${
                clickable ? 'cursor-pointer hover:bg-[var(--bg-hover)]' : ''
              }`}
            >
              {columns.map((col, colIndex) => (
                <td
                  key={col.key}
                  className={`px-4 py-4 align-middle first:pl-0 last:pr-0 ${
                    colIndex === 0 ? 'type-label' : 'type-body-small'
                  } ${col.className ?? ''}`}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
