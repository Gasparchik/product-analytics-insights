import { cn } from './utils'

export interface TabItem {
  id: string
  label: string
  count?: number
}

export interface TabsProps {
  items: TabItem[]
  active: string
  onChange?: (id: string) => void
  className?: string
}

export function Tabs({ items, active, onChange, className }: TabsProps) {
  return (
    <div className={cn('flex gap-1 border-b border-border', className)}>
      {items.map(item => {
        const isActive = item.id === active
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange?.(item.id)}
            className={cn(
              'relative flex items-center gap-[6px] px-[10px] py-[8px]',
              'text-[13px] font-medium tracking-[-0.005em] leading-none',
              'cursor-pointer transition-colors duration-[120ms]',
              'focus-visible:outline-none',
              isActive ? 'text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {item.label}
            {item.count != null && (
              <span className={cn(
                'text-[10.5px] tabular-nums px-[5px] py-[1px] bg-surface-2 rounded-sm',
                isActive ? 'text-fg' : 'text-fg-subtle',
              )}>
                {item.count}
              </span>
            )}
            {isActive && (
              <span className="absolute left-[8px] right-[8px] bottom-[-1px] h-[2px] bg-fg rounded-[1px]" />
            )}
          </button>
        )
      })}
    </div>
  )
}
