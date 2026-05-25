import { cn } from './utils'

export interface TableColumn {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
  numeric?: boolean
  mono?: boolean
}

export interface DataTableProps {
  columns: TableColumn[]
  rows: Record<string, unknown>[]
  striped?: boolean
  compact?: boolean
  className?: string
}

export function DataTable({ columns, rows, striped, compact, className }: DataTableProps) {
  const rowH = compact ? 32 : 36
  const cellPy = `${(rowH - 16) / 2}px`

  return (
    <div className={cn('border border-border rounded-lg overflow-hidden bg-surface', className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-sans">
          <thead>
            <tr className="bg-surface-2">
              {columns.map(col => (
                <th
                  key={col.key}
                  className={cn(
                    'text-[11px] font-medium text-fg-muted tracking-[0.04em] leading-none',
                    'px-3 py-2 border-b border-border',
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                    col.numeric && 'tabular-nums',
                  )}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr
                key={ri}
                className={cn(
                  ri > 0 && 'border-t border-border',
                  striped && ri % 2 === 1 && 'bg-surface-2',
                )}
              >
                {columns.map((col, ci) => (
                  <td
                    key={col.key}
                    className={cn(
                      'text-[13px] leading-none px-3 whitespace-nowrap max-w-[220px] overflow-hidden text-ellipsis',
                      ci === 0 ? 'text-fg' : 'text-fg-muted',
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                      col.numeric && 'tabular-nums',
                      col.mono && 'font-mono text-[12px]',
                    )}
                    style={{ paddingTop: cellPy, paddingBottom: cellPy }}
                  >
                    {String(row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
