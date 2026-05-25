import { ReactNode, useEffect, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { cn } from './utils'

export interface ChartContainerProps {
  title: string
  subtitle?: string
  action?: ReactNode
  height: number
  children: ReactNode | ((props: { width: number; height: number }) => ReactNode)
  padding?: number
  className?: string
  // When provided, shows a chart/table toggle button in the header
  tableData?: Record<string, unknown>[]
}

function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 1.5v7M4 6.5l2.5 2.5L9 6.5" />
      <path d="M1.5 10.5h10" />
    </svg>
  )
}

function TableToggleIcon({ isTable }: { isTable: boolean }) {
  if (isTable) {
    // Chart icon (line chart) — switch back to chart
    return (
      <svg width="14" height="12" viewBox="0 0 14 12" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 10.5l3.5-4.5 2.5 2.5L10.5 2" />
        <path d="M1 10.5h12" />
      </svg>
    )
  }
  // Table icon — switch to table
  return (
    <svg width="14" height="12" viewBox="0 0 14 12" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round">
      <rect x="1" y="1" width="12" height="10" rx="1.5" />
      <path d="M1 4.5h12" />
      <path d="M5 4.5v6.5" />
    </svg>
  )
}

function fmtCell(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '—'
    // Values strictly between 0 and 1 → percentage (e.g. cohort retention rates)
    if (v > 0 && v < 1) return Math.round(v * 100) + '%'
    return v.toLocaleString()
  }
  return String(v)
}

function InlineTable({ data, maxHeight }: { data: Record<string, unknown>[]; maxHeight: number }) {
  if (!data.length) return (
    <div className="flex items-center justify-center text-[12px] text-fg-subtle h-full">No data</div>
  )
  const cols = Object.keys(data[0])

  return (
    <div className="w-full overflow-auto" style={{ maxHeight }}>
      <table className="w-full border-collapse" style={{ fontSize: 11.5 }}>
        <thead>
          <tr>
            {cols.map(col => (
              <th
                key={col}
                className="text-left py-[5px] px-[9px] border-b border-border font-medium text-fg-subtle sticky top-0 bg-surface whitespace-nowrap"
                style={{ textTransform: 'capitalize' }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={i}
              style={{ background: i % 2 === 0 ? 'transparent' : 'var(--surface-2)' }}
            >
              {cols.map(col => {
                const v = row[col]
                const isNum = typeof v === 'number'
                return (
                  <td
                    key={col}
                    className="py-[5px] px-[9px] text-fg border-b border-border whitespace-nowrap"
                    style={{
                      textAlign: isNum ? 'right' : 'left',
                      fontVariantNumeric: isNum ? 'tabular-nums' : 'normal',
                      borderBottomColor: 'var(--border)',
                    }}
                  >
                    {fmtCell(v)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ChartContainer({
  title,
  subtitle,
  action,
  height,
  children,
  padding = 16,
  className,
  tableData,
}: ChartContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [showTable, setShowTable] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const apply = () => setWidth(Math.round(el.getBoundingClientRect().width))
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  async function handleExport() {
    const el = containerRef.current
    if (!el || exporting) return
    setExporting(true)
    try {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#ffffff'
      const dataUrl = await toPng(el, { pixelRatio: 2, backgroundColor: bg })
      const link = document.createElement('a')
      link.download = `${title.toLowerCase().replace(/\s+/g, '-')}.png`
      link.href = dataUrl
      link.click()
    } catch {
      // silently ignore export errors
    } finally {
      setExporting(false)
    }
  }

  const tableMaxHeight = Math.max(height, 280)

  return (
    <div
      ref={containerRef}
      className={cn(
        'bg-surface border border-border rounded-lg flex flex-col gap-3 min-w-0',
        className,
      )}
      style={{ padding }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-medium tracking-[-0.005em] text-fg leading-none">
            {title}
          </div>
          {subtitle && (
            <div className="text-[11px] font-medium tracking-[0.04em] text-fg-subtle leading-none mt-[2px]">
              {subtitle}
            </div>
          )}
        </div>
        <div className="flex items-center gap-[8px] flex-shrink-0">
          {action}
          <button
            type="button"
            onClick={handleExport}
            title="Export as PNG"
            disabled={exporting}
            className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-md border border-border text-fg-subtle hover:text-fg hover:border-border-strong cursor-pointer transition-colors duration-[100ms] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <DownloadIcon />
          </button>
          {tableData && tableData.length > 0 && (
            <button
              type="button"
              onClick={() => setShowTable(t => !t)}
              title={showTable ? 'Show chart' : 'Show table'}
              className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-md border border-border text-fg-subtle hover:text-fg hover:border-border-strong cursor-pointer transition-colors duration-[100ms]"
              style={{
                background: showTable ? 'var(--surface-2)' : 'transparent',
                color: showTable ? 'var(--fg)' : undefined,
              }}
            >
              <TableToggleIcon isTable={showTable} />
            </button>
          )}
        </div>
      </div>

      {/* Body: chart or table */}
      {showTable && tableData ? (
        <InlineTable data={tableData} maxHeight={tableMaxHeight} />
      ) : (
        <div
          ref={bodyRef}
          className="w-full flex items-stretch min-w-0"
          style={{ height }}
        >
          {typeof children === 'function'
            ? width > 0 ? children({ width, height }) : null
            : children}
        </div>
      )}
    </div>
  )
}
