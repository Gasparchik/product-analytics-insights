import { ReactNode, useEffect } from 'react'
import { cn } from './utils'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  body?: ReactNode
  footer?: ReactNode
}

export function Modal({ open, onClose, title, description, body, footer }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'var(--overlay)' }}
      onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={cn(
          'w-[440px] bg-surface border border-border rounded-lg overflow-hidden',
        )}
        style={{ boxShadow: 'var(--shadow-3)' }}
      >
        {/* Header */}
        <div className="flex flex-col gap-1 px-5 pt-[18px] pb-[14px]">
          <div className="flex items-center justify-between">
            <span className="text-[17px] font-medium tracking-[-0.2px] text-fg">{title}</span>
            <button
              type="button"
              onClick={onClose}
              className="flex items-center justify-center w-6 h-6 text-fg-subtle hover:text-fg rounded-sm cursor-pointer focus-visible:outline-none"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M3 3l8 8M11 3l-8 8" />
              </svg>
            </button>
          </div>
          {description && (
            <span className="text-[13px] text-fg-muted leading-normal">{description}</span>
          )}
        </div>

        {/* Body */}
        {body && <div className="px-5 pb-[18px]">{body}</div>}

        {/* Footer */}
        {footer && (
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-border bg-surface-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
