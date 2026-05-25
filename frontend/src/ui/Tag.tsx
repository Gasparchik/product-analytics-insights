import { ReactNode } from 'react'
import { cn } from './utils'

export type TagTone = 'neutral' | 'accent' | 'danger' | 'warning' | 'success' | 'info' | 'outline'

export interface TagProps {
  tone?: TagTone
  icon?: ReactNode
  children: ReactNode
  className?: string
}

const toneStyles: Record<TagTone, string> = {
  neutral: 'bg-surface-2 text-fg-muted border-border',
  accent:  'bg-accent-tint text-accent border-transparent',
  danger:  'bg-danger-tint text-danger border-transparent',
  warning: 'bg-warning-tint text-warning border-transparent',
  success: 'bg-success-tint text-success border-transparent',
  info:    'bg-info-tint text-info border-transparent',
  outline: 'bg-transparent text-fg-muted border-border',
}

export function Tag({ tone = 'neutral', icon, children, className }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[5px] h-[20px] px-[7px]',
        'border rounded-sm',
        'text-[11px] font-medium tracking-[0] leading-none',
        toneStyles[tone],
        className,
      )}
    >
      {icon && <span className="flex shrink-0">{icon}</span>}
      {children}
    </span>
  )
}
