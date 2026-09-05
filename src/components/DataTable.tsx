import type { ReactNode } from 'react';
import { EmptyState } from './ui';
export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
}
export function DataTable<T extends { id: string }>({
  rows,
  columns,
  caption,
  emptyTitle = 'No records yet',
  emptyDescription = 'Try a different filter, or add the first record to begin this workflow.',
}: {
  rows: T[];
  columns: Column<T>[];
  caption: string;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (!rows.length) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return (
    <div className="table-scroll" role="region" aria-label={caption} tabIndex={0}>
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td key={column.key}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
