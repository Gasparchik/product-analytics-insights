import { useState } from 'react'
import { cn } from './utils'
import { FloatTip } from './chartUtils'

export interface CohortRow {
  label: string
  size: number
  // Absolute counts: values[0] = size (100%), subsequent = returning users (or null)
  values: (number | null)[]
}

export interface CohortHeatmapProps {
  rows: CohortRow[]
  weekLabels?: string[]
  className?: string
}

type HoverState = { ri: number; ci: number; x: number; y: number } | null

export function CohortHeatmap({ rows, weekLabels, className }: CohortHeatmapProps) {
  if (!rows.length) return null
  const numCols = rows[0].values.length
  const labels = weekLabels ?? Array.from({ length: numCols }, (_, i) => `W${i}`)
  const [hover, setHover] = useState<HoverState>(null)

  const LABEL_W = 72
  const SIZE_W = 56
  const CELL_W = 52
  const CELL_H = 26
  const GAP = 2

  function cellBg(pct: number | null): string {
    if (pct === null) return 'transparent'
    const a = Math.min(0.92, 0.06 + pct * 0.86)
    return `color-mix(in oklch, var(--accent) ${Math.round(a * 100)}%, transparent)`
  }

  function cellTextColor(pct: number | null): string {
    if (pct === null) return 'transparent'
    return pct > 0.45 ? 'var(--accent-fg)' : 'var(--fg-muted)'
  }

  const hovRow = hover !== null ? rows[hover.ri] : null
  const hovVal = hovRow && hover !== null ? hovRow.values[hover.ci] : null
  const hovPct = hovRow && hover !== null
    ? (hover.ci === 0 ? 1 : hovVal === null ? null : hovVal / hovRow.size)
    : null

  return (
    <div className={cn('w-full', className)}>
      {/* Header */}
      <div
        className="grid mb-[6px]"
        style={{
          gridTemplateColumns: `${LABEL_W}px ${SIZE_W}px repeat(${numCols}, ${CELL_W}px)`,
        }}
      >
        <div />
        <div className="text-[11px] font-medium tracking-[0.04em] text-fg-subtle text-right pr-2">
          Users
        </div>
        {labels.map((l, i) => (
          <div key={i} className="text-[11px] font-medium tracking-[0.04em] text-fg-subtle text-center">
            {l}
          </div>
        ))}
      </div>

      {/* Data rows */}
      {rows.map((row, ri) => (
        <div
          key={ri}
          className="grid items-center"
          style={{
            gridTemplateColumns: `${LABEL_W}px ${SIZE_W}px repeat(${numCols}, ${CELL_W}px)`,
            marginBottom: ri < rows.length - 1 ? GAP : 0,
          }}
        >
          <div className="text-[11px] text-fg-muted truncate pr-2">{row.label}</div>
          <div className="text-[11px] text-fg-subtle text-right pr-2 tabular-nums">
            {row.size.toLocaleString()}
          </div>
          {row.values.map((val, ci) => {
            const pct = ci === 0 ? 1 : val === null ? null : val / row.size
            const text =
              ci === 0 ? '100%'
              : val === null ? ''
              : Math.round((val / row.size) * 100) + '%'
            const isHovered = hover?.ri === ri && hover?.ci === ci
            return (
              <div
                key={ci}
                className="flex items-center justify-center rounded-[3px] text-[11px] font-medium tabular-nums cursor-default transition-[outline] duration-[60ms]"
                style={{
                  height: CELL_H,
                  marginRight: ci < row.values.length - 1 ? GAP : 0,
                  background: cellBg(pct),
                  color: cellTextColor(pct),
                  outline: isHovered && pct !== null ? '2px solid var(--accent)' : 'none',
                  outlineOffset: 0,
                }}
                onMouseEnter={e => {
                  if (pct === null) return
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  setHover({ ri, ci, x: rect.right, y: rect.top + rect.height / 2 })
                }}
                onMouseLeave={() => setHover(null)}
              >
                {text}
              </div>
            )
          })}
        </div>
      ))}

      {/* Legend */}
      <div className="flex items-center gap-2 mt-4">
        <span className="text-[11px] text-fg-subtle">0%</span>
        <div
          className="h-[6px] rounded-[3px]"
          style={{
            width: 160,
            background:
              'linear-gradient(to right, color-mix(in oklch, var(--accent) 6%, transparent), var(--accent))',
          }}
        />
        <span className="text-[11px] text-fg-subtle">100%</span>
      </div>

      {/* Floating tooltip */}
      {hover !== null && hovRow !== null && hovPct !== null && (
        <FloatTip x={hover.x} y={hover.y}>
          <span style={{ fontWeight: 600 }}>{hovRow.label}</span>
          <span style={{ opacity: 0.65, margin: '0 5px' }}>·</span>
          <span>{labels[hover.ci]}</span>
          <span style={{ margin: '0 6px', opacity: 0.4 }}>|</span>
          <span style={{ fontWeight: 600 }}>{Math.round(hovPct * 100)}%</span>
          {hover.ci > 0 && hovVal !== null && (
            <span style={{ opacity: 0.65, marginLeft: 5 }}>
              ({hovVal.toLocaleString()} of {hovRow.size.toLocaleString()})
            </span>
          )}
        </FloatTip>
      )}
    </div>
  )
}
