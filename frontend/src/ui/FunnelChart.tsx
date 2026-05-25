import { useState } from 'react'
import { cn } from './utils'
import { fmtNum, FloatTip } from './chartUtils'

export interface FunnelStep {
  label: string
  users: number
}

export interface FunnelChartProps {
  steps: FunnelStep[]
  formatCount?: (v: number) => string
  className?: string
}

type HoverState = { index: number; x: number; y: number } | null

export function FunnelChart({ steps, formatCount = fmtNum, className }: FunnelChartProps) {
  if (!steps.length) return null
  const max = steps[0].users
  const [hover, setHover] = useState<HoverState>(null)

  return (
    <div className={cn('w-full h-full flex flex-col justify-center gap-[10px]', className)}>
      {steps.map((step, i) => {
        const pct = step.users / max
        const prev = i > 0 ? steps[i - 1].users : null
        const stepConv = prev ? Math.round((step.users / prev) * 100) : 100
        const dropped = prev ? prev - step.users : 0
        const isHovered = hover?.index === i

        return (
          <div
            key={i}
            className="flex items-center gap-[6px] rounded-[3px] transition-colors duration-[80ms]"
            style={{ background: isHovered ? 'var(--surface-2)' : 'transparent', margin: '0 -4px', padding: '0 4px' }}
            onMouseEnter={e => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setHover({ index: i, x: rect.right, y: rect.top + rect.height / 2 })
            }}
            onMouseLeave={() => setHover(null)}
          >
            {/* Label */}
            <div className="flex-shrink-0 text-right" style={{ width: 148 }}>
              <div className="text-[13px] font-medium text-fg leading-none">{step.label}</div>
              <div className="text-[11px] text-fg-subtle mt-[2px]">step {i + 1}</div>
            </div>

            {/* Bar track + fill */}
            <div className="flex-1 relative min-w-0" style={{ height: 38 }}>
              <div className="absolute inset-[4px_0] rounded-[3px] bg-surface-2" />
              <div
                className="absolute top-[4px] bottom-[4px] left-0 rounded-[3px] transition-[width] duration-[120ms]"
                style={{
                  width: `${pct * 100}%`,
                  background: i === 0
                    ? 'var(--accent)'
                    : isHovered
                    ? 'var(--border-strong)'
                    : 'var(--border-strong)',
                  opacity: isHovered ? 1 : 0.85,
                }}
              />
            </div>

            {/* Value */}
            <div className="flex-shrink-0" style={{ width: 90 }}>
              <div className="text-[13px] font-medium text-fg tabular-nums leading-none">
                {formatCount(step.users)}
              </div>
              {i > 0 && (
                <div className="text-[11px] text-fg-subtle tabular-nums mt-[2px]">
                  {stepConv}% of prev
                </div>
              )}
            </div>

            {/* Floating tooltip */}
            {isHovered && hover !== null && (
              <FloatTip x={hover.x} y={hover.y}>
                <span style={{ fontWeight: 600 }}>{step.label}</span>
                <span style={{ margin: '0 6px', opacity: 0.4 }}>|</span>
                <span style={{ fontWeight: 600 }}>{step.users.toLocaleString()}</span>
                <span style={{ opacity: 0.65, marginLeft: 5 }}>
                  users
                </span>
                {i > 0 && (
                  <>
                    <span style={{ margin: '0 6px', opacity: 0.4 }}>·</span>
                    <span style={{ opacity: 0.65 }}>
                      {stepConv}% converted
                    </span>
                    {dropped > 0 && (
                      <span style={{ opacity: 0.55, marginLeft: 5 }}>
                        (−{dropped.toLocaleString()} dropped)
                      </span>
                    )}
                  </>
                )}
              </FloatTip>
            )}
          </div>
        )
      })}
    </div>
  )
}
