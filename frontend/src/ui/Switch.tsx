import { cn } from './utils'

export interface SwitchProps {
  on: boolean
  onChange?: (on: boolean) => void
  disabled?: boolean
  className?: string
}

export function Switch({ on, onChange, disabled, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange?.(!on)}
      className={cn(
        'relative inline-flex items-center shrink-0',
        'w-[34px] h-[16px] p-[2px] rounded-full border',
        'transition-[background,border-color] duration-[150ms]',
        'cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
        'focus-visible:outline-none',
        className,
      )}
      style={{
        background: on ? 'var(--accent)' : 'var(--surface-3)',
        borderColor: on ? 'transparent' : 'var(--border)',
        boxShadow: 'none',
      }}
    >
      <span
        className="block w-[10px] h-[10px] rounded-full transition-[transform,background] duration-[150ms]"
        style={{
          background: on ? '#fff' : 'var(--fg-muted)',
          transform: on ? 'translateX(18px)' : 'translateX(0)',
          boxShadow: '0 1px 2px rgba(0,0,0,.18)',
        }}
      />
    </button>
  )
}
