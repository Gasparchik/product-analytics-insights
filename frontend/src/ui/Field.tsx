import { ReactNode } from 'react'
import { cn } from './utils'
import { InfoTip } from './InfoTip'

export interface FieldProps {
  label?: string
  hint?: string
  error?: string
  tooltip?: string
  children: ReactNode
  className?: string
}

export function Field({ label, hint, error, tooltip, children, className }: FieldProps) {
  return (
    <label className={cn('flex flex-col gap-[6px]', className)}>
      {label && (
        <span className="flex items-center gap-[5px] text-[12px] font-medium text-fg-muted leading-none">
          {label}
          {tooltip && <InfoTip text={tooltip} />}
        </span>
      )}
      {children}
      {(hint || error) && (
        <span className={cn(
          'text-[11px] font-medium leading-none tracking-[0]',
          error ? 'text-danger' : 'text-fg-subtle',
        )}>
          {error || hint}
        </span>
      )}
    </label>
  )
}
