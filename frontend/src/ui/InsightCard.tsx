import { Tag } from './Tag'
import { cn } from './utils'

export interface InsightCardProps {
  severity: 'high' | 'medium' | 'low'
  category: string
  title: string
  description: string
  metric?: { value: string; label: string }
  tags?: string[]
  onInvestigate?: () => void
  onPin?: () => void
  onDismiss?: () => void
  pinned?: boolean
  dismissed?: boolean
  className?: string
}

function PinIcon({ active }: { active?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <line x1="6" y1="6.5" x2="6" y2="11" />
      <circle cx="6" cy="3.5" r="2.5" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.3 : 0} />
      <line x1="3.5" y1="6.5" x2="8.5" y2="6.5" />
    </svg>
  )
}

const severityConfig = {
  high:   { colorVar: 'var(--danger)',  label: 'High',   toneClass: 'bg-danger-tint text-danger' },
  medium: { colorVar: 'var(--warning)', label: 'Medium', toneClass: 'bg-warning-tint text-warning' },
  low:    { colorVar: 'var(--info)',    label: 'Low',    toneClass: 'bg-info-tint text-info' },
}

export function InsightCard({
  severity,
  category,
  title,
  description,
  metric,
  tags = [],
  onInvestigate,
  onPin,
  onDismiss,
  pinned = false,
  dismissed = false,
  className,
}: InsightCardProps) {
  const { colorVar, label, toneClass } = severityConfig[severity]

  return (
    <div
      className={cn(
        'group relative bg-surface border border-border rounded-lg',
        'p-[14px_16px_14px_18px] flex flex-col gap-2',
        dismissed && 'opacity-50',
        className,
      )}
      style={{ borderLeft: `2px solid ${colorVar}` }}
    >
      {/* Action buttons — appear on hover; pin stays visible when active */}
      <div
        className={cn(
          'absolute top-3 right-3 flex items-center gap-[8px]',
          'transition-opacity duration-[120ms]',
          pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
      >
        {onPin && (
          <button
            type="button"
            onClick={onPin}
            title={pinned ? 'Unpin' : 'Pin'}
            className="inline-flex items-center justify-center w-[20px] h-[20px] rounded cursor-pointer transition-colors duration-[80ms]"
            style={{ color: pinned ? 'var(--accent)' : 'var(--fg-subtle)' }}
            onMouseEnter={e => { if (!pinned) (e.currentTarget as HTMLElement).style.color = 'var(--fg)' }}
            onMouseLeave={e => { if (!pinned) (e.currentTarget as HTMLElement).style.color = 'var(--fg-subtle)' }}
          >
            <PinIcon active={pinned} />
          </button>
        )}
        {onInvestigate && (
          <button
            type="button"
            onClick={onInvestigate}
            className="text-[11px] font-medium text-accent cursor-pointer focus-visible:outline-none"
          >
            Investigate ↗
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            title={dismissed ? 'Restore' : 'Dismiss'}
            className="inline-flex items-center justify-center w-[20px] h-[20px] rounded text-[15px] leading-none cursor-pointer text-fg-subtle hover:text-fg transition-colors duration-[80ms]"
          >
            {dismissed ? '↩' : '×'}
          </button>
        )}
      </div>

      {/* Severity pill + category */}
      <div className="flex items-center gap-2">
        <span className={cn(
          'text-[11px] font-medium leading-none px-[7px] py-[2px] rounded-sm',
          toneClass,
        )}>
          {label} severity
        </span>
        {category && (
          <span className="text-[11px] font-medium text-fg-muted leading-none">{category}</span>
        )}
      </div>

      {/* Title */}
      <div className="text-[14px] font-medium text-fg leading-[1.4]">{title}</div>

      {/* Description */}
      <div className="text-[13px] text-fg-muted leading-[1.5]">{description}</div>

      {/* Metric (high severity only) */}
      {metric && (
        <div className="flex items-baseline gap-2 mt-[2px]">
          <span className="text-[22px] font-medium tracking-[-0.6px] tabular-nums text-fg leading-none">
            {metric.value}
          </span>
          <span className="text-[13px] text-fg-muted">{metric.label}</span>
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-[6px] mt-[2px]">
          {tags.map(t => <Tag key={t}>{t}</Tag>)}
        </div>
      )}
    </div>
  )
}
