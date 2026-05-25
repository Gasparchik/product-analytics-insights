import { ReactNode } from 'react'
import { MiniSparkline } from './MiniSparkline'
import { cn } from './utils'

export interface StatCardProps {
  label: string
  value: string
  delta?: number
  deltaDir?: 'up' | 'down'
  trail?: number[]
  helper?: ReactNode
  showDelta?: boolean
  className?: string
}

function UpArrow() {
  return <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor"><path d="M4.5 1.5l3 4h-6z" /></svg>
}
function DownArrow() {
  return <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor"><path d="M4.5 7.5l-3-4h6z" /></svg>
}

export function StatCard({ label, value, delta, deltaDir, trail, helper, showDelta = true, className }: StatCardProps) {
  const deltaColor = deltaDir === 'up'
    ? 'var(--success)'
    : deltaDir === 'down'
    ? 'var(--danger)'
    : 'var(--fg-muted)'

  const sparklineColor = deltaDir === 'up'
    ? 'var(--success)'
    : deltaDir === 'down'
    ? 'var(--danger)'
    : 'var(--fg-subtle)'

  return (
    <div className={cn(
      'bg-surface border border-border rounded-lg p-[14px_16px]',
      'flex flex-col gap-[6px] min-w-0',
      className,
    )}>
      {/* Label row */}
      <div className="flex items-center justify-between text-[11px] font-medium text-fg-muted leading-none">
        <span>{label}</span>
        {helper}
      </div>

      {/* Value */}
      <div className="text-[28px] font-medium tracking-[-0.6px] leading-none tabular-nums text-fg mt-[2px]">
        {value}
      </div>

      {/* Delta + sparkline */}
      <div className="flex items-center justify-between gap-2">
        {showDelta && delta != null ? (
          <span
            className="inline-flex items-center gap-1 text-[13px] leading-none tabular-nums"
            style={{ color: deltaColor }}
          >
            {deltaDir === 'up' && <UpArrow />}
            {deltaDir === 'down' && <DownArrow />}
            {Math.abs(delta).toFixed(1)}%
            <span className="text-fg-subtle font-normal ml-0.5">vs prev</span>
          </span>
        ) : (
          <span />
        )}
        {trail && trail.length >= 2 && (
          <MiniSparkline values={trail} color={showDelta && delta != null ? sparklineColor : undefined} />
        )}
      </div>
    </div>
  )
}
