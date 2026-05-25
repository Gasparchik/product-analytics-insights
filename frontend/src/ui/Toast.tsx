import { ReactNode } from 'react'
import { cn } from './utils'

export type ToastKind = 'success' | 'error' | 'info'

export interface ToastProps {
  kind?: ToastKind
  title: string
  description?: string
  onClose?: () => void
  className?: string
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 7.2l3 3 6-6" />
    </svg>
  )
}
function AlertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M7 2v5.5M7 10v.5" /><circle cx="7" cy="7" r="5.5" />
    </svg>
  )
}
function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="7" cy="7" r="5.5" /><path d="M7 6v4M7 4.2v0" />
    </svg>
  )
}

const kindConfig: Record<ToastKind, { icon: ReactNode; colorVar: string }> = {
  success: { icon: <CheckIcon />, colorVar: 'var(--success)' },
  error:   { icon: <AlertIcon />, colorVar: 'var(--danger)' },
  info:    { icon: <InfoIcon />,  colorVar: 'var(--info)' },
}

export function Toast({ kind = 'info', title, description, onClose, className }: ToastProps) {
  const { icon, colorVar } = kindConfig[kind]

  return (
    <div
      className={cn(
        'flex gap-[10px] items-start w-[360px] p-[12px_14px]',
        'bg-surface border border-border rounded-lg',
        className,
      )}
      style={{ boxShadow: 'var(--shadow-2)' }}
    >
      <span
        className="flex items-center justify-center w-[22px] h-[22px] shrink-0 mt-[1px]"
        style={{ color: colorVar }}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-fg leading-normal">{title}</div>
        {description && (
          <div className="text-[13px] text-fg-muted leading-normal mt-[2px]">{description}</div>
        )}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="flex text-fg-subtle hover:text-fg cursor-pointer mt-[2px] focus-visible:outline-none"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
          </svg>
        </button>
      )}
    </div>
  )
}
