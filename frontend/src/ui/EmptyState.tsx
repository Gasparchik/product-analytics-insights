import { ReactNode } from 'react'

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 px-6 text-center">
      {icon && (
        <div className="w-9 h-9 rounded-lg bg-surface-2 border border-border flex items-center justify-center text-fg-subtle mb-1">
          {icon}
        </div>
      )}
      <div className="text-[14px] font-medium text-fg leading-normal">{title}</div>
      {description && (
        <div className="text-[13px] text-fg-muted max-w-[320px] leading-[1.5]">{description}</div>
      )}
      {action && <div className="mt-[6px]">{action}</div>}
    </div>
  )
}
