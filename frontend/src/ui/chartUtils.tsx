// Shared tooltip, colors, and tick config for all chart components.
import { ReactNode } from 'react'

export const CHART_COLORS = [
  'var(--accent)',
  'var(--success)',
  'var(--warning)',
  'var(--danger)',
  'var(--info)',
]

export const TICK_STYLE = {
  fontSize: 10.5,
  fill: 'var(--fg-subtle)',
  fontFamily: 'inherit',
}

export function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '') + 'k'
  return String(n)
}

interface TooltipEntry {
  name: string
  value: number | string
  color: string
  dataKey: string
}

interface ChartTooltipProps {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string
  formatValue?: (v: number, key: string) => string
}

export function ChartTooltip({ active, payload, label, formatValue }: ChartTooltipProps) {
  if (!active || !payload?.length) return null

  const showTotal = payload.length > 1
  const total = showTotal ? payload.reduce((s, e) => s + Number(e.value), 0) : 0

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
      padding: '5px 10px',
      fontSize: 12,
      minWidth: 110,
      fontFamily: 'inherit',
    }}>
      {label && (
        <div style={{ color: 'var(--fg-subtle)', marginBottom: 4, fontSize: 10, fontWeight: 500 }}>
          {label}
        </div>
      )}
      {payload.map((entry, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              display: 'inline-block', width: 6, height: 6,
              borderRadius: '50%', background: entry.color, flexShrink: 0,
            }} />
            <span style={{ color: 'var(--fg-muted)' }}>{entry.name}</span>
          </div>
          <span style={{ fontWeight: 500, color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
            {formatValue
              ? formatValue(Number(entry.value), entry.dataKey)
              : fmtNum(Number(entry.value))}
          </span>
        </div>
      ))}
      {showTotal && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
          borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4,
        }}>
          <span style={{ color: 'var(--fg-subtle)' }}>Total</span>
          <span style={{ fontWeight: 600, color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
            {formatValue ? formatValue(total, 'total') : fmtNum(total)}
          </span>
        </div>
      )}
    </div>
  )
}

export interface LegendItem {
  label: string
  accent?: boolean
  color?: string
}

export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 10, height: 10, borderRadius: 2, flexShrink: 0, display: 'inline-block',
            background: item.color ?? (item.accent ? 'var(--accent)' : 'var(--surface-3)'),
            border: item.accent ? 'none' : '1px solid var(--border)',
          }} />
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--fg-muted)', letterSpacing: '0.04em' }}>
            {item.label}
          </span>
        </div>
      ))}
    </div>
  )
}

// Floating tooltip for custom HTML charts (HBarChart, FunnelChart, CohortHeatmap).
// Uses position:fixed so it escapes any overflow:hidden container.
export function FloatTip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div
      style={{
        position: 'fixed',
        left: x + 12,
        top: y,
        transform: 'translateY(-50%)',
        zIndex: 9999,
        pointerEvents: 'none',
        background: 'var(--fg)',
        color: 'var(--bg)',
        padding: '5px 9px',
        borderRadius: 6,
        fontSize: 11.5,
        fontFamily: 'inherit',
        lineHeight: 1.5,
        boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </div>
  )
}
