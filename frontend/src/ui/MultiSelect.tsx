import { cn } from './utils'

export interface MultiSelectProps {
  values: string[]
  onRemove?: (value: string) => void
  placeholder?: string
  className?: string
}

export function MultiSelect({ values, onRemove, placeholder = 'Select…', className }: MultiSelectProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-[6px] min-h-[34px] p-[5px]',
        'bg-surface border border-border rounded-md',
        className,
      )}
    >
      {values.length === 0 && (
        <span className="text-[13px] text-fg-subtle px-[6px] tracking-[-0.005em]">{placeholder}</span>
      )}
      {values.map(v => (
        <span
          key={v}
          className="inline-flex items-center gap-[6px] text-[12px] py-[3px] pl-[8px] pr-[4px] bg-surface-2 border border-border rounded-sm text-fg"
        >
          {v}
          <button
            type="button"
            onClick={() => onRemove?.(v)}
            className="flex text-fg-subtle hover:text-fg cursor-pointer"
            aria-label={`Remove ${v}`}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 2l6 6M8 2l-6 6" />
            </svg>
          </button>
        </span>
      ))}
    </div>
  )
}
