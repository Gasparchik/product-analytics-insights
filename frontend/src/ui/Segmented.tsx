import { cn } from './utils'

export interface SegmentedOption {
  id: string
  label: string
  disabled?: boolean
}

export interface SegmentedProps {
  value: string
  options: SegmentedOption[]
  onChange: (value: string) => void
  className?: string
}

export function Segmented({ value, options, onChange, className }: SegmentedProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center p-[2px] bg-surface border border-border rounded-md gap-0',
        className,
      )}
    >
      {options.map(opt => {
        const active = opt.id === value
        return (
          <button
            key={opt.id}
            type="button"
            disabled={opt.disabled}
            onClick={() => !opt.disabled && onChange(opt.id)}
            className={cn(
              'flex items-center justify-center h-[22px] px-[8px] rounded-sm',
              'text-[11px] font-medium tracking-[0] leading-none',
              'transition-[background,color] duration-[120ms]',
              'focus-visible:outline-none',
              active
                ? 'bg-surface-2 text-fg'
                : 'bg-transparent text-fg-subtle hover:text-fg',
              opt.disabled && 'opacity-40 cursor-not-allowed',
              !opt.disabled && !active && 'cursor-pointer',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
