import { useState } from 'react'
import { cn } from './utils'
import { FloatTip } from './chartUtils'

export interface HBarChartDataPoint {
  label: string
  value: number
}

export interface HBarChartProps {
  data: HBarChartDataPoint[]
  // Index of bar to highlight with accent; 0 = top (default)
  accentIndex?: number
  formatValue?: (v: number) => string
  className?: string
  onBarClick?: (index: number, dataPoint: HBarChartDataPoint) => void
  selectedIndex?: number
}

type HoverState = { index: number; x: number; y: number } | null

export function HBarChart({ data, accentIndex = 0, formatValue, className, onBarClick, selectedIndex = -1 }: HBarChartProps) {
  const max = Math.max(...data.map(d => d.value), 1)
  const total = data.reduce((s, d) => s + d.value, 0)
  const [hover, setHover] = useState<HoverState>(null)

  return (
    <div className={cn('w-full h-full flex flex-col justify-center gap-[5px] overflow-hidden', className)}>
      {data.map((d, i) => {
        const pct = (d.value / max) * 100
        const sharePct = total > 0 ? Math.round((d.value / total) * 100) : 0
        const isSelected = i === selectedIndex
        const isAccent = i === accentIndex || isSelected
        const isHovered = hover?.index === i
        return (
          <div
            key={i}
            className="flex items-center gap-[6px] min-w-0 rounded-[3px] transition-colors duration-[80ms]"
            style={{
              background: isSelected
                ? 'color-mix(in oklch, var(--accent) 8%, transparent)'
                : isHovered ? 'var(--surface-2)' : 'transparent',
              margin: '0 -4px',
              padding: '0 4px',
              cursor: onBarClick ? 'pointer' : undefined,
            }}
            onClick={onBarClick ? () => onBarClick(i, d) : undefined}
            onMouseEnter={e => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setHover({ index: i, x: rect.right, y: rect.top + rect.height / 2 })
            }}
            onMouseLeave={() => setHover(null)}
          >
            <div
              className="flex-shrink-0 text-[12px] truncate text-right"
              style={{ width: 130, color: isSelected ? 'var(--accent)' : 'var(--fg-muted)' }}
            >
              {d.label}
            </div>
            <div className="flex-1 relative min-w-0" style={{ height: 16 }}>
              <div className="absolute inset-0 rounded-[2px] bg-surface-2" />
              <div
                className="absolute inset-y-0 left-0 rounded-[2px] transition-[width] duration-[120ms]"
                style={{
                  width: `${pct}%`,
                  background: isAccent ? 'var(--accent)' : 'var(--border-strong)',
                }}
              />
            </div>
            <div
              className="flex-shrink-0 text-[12px] tabular-nums"
              style={{ width: 52, color: isSelected ? 'var(--accent)' : 'var(--fg)' }}
            >
              {formatValue ? formatValue(d.value) : d.value.toLocaleString()}
            </div>

            {hover?.index === i && (
              <FloatTip x={hover.x} y={hover.y}>
                <span style={{ fontWeight: 600 }}>{d.label}</span>
                {'  '}
                <span>{d.value.toLocaleString()}</span>
                <span style={{ opacity: 0.65, marginLeft: 6 }}>{sharePct}% of total</span>
              </FloatTip>
            )}
          </div>
        )
      })}
    </div>
  )
}
