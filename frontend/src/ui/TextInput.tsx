import { InputHTMLAttributes, ReactNode, forwardRef, useState } from 'react'
import { cn } from './utils'

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  leading?: ReactNode
  trailing?: ReactNode
  error?: boolean
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  ({ leading, trailing, error, disabled, className, onFocus, onBlur, ...props }, ref) => {
    const [focused, setFocused] = useState(false)

    return (
      <div
        className={cn(
          'flex items-center gap-2 h-[34px] px-[10px]',
          'bg-surface border rounded-md',
          'transition-[border-color,box-shadow] duration-[120ms]',
          disabled && 'bg-surface-2 opacity-60',
        )}
        style={{
          borderColor: focused ? 'var(--accent)' : error ? 'var(--danger)' : 'var(--border)',
          boxShadow: focused ? '0 0 0 3px var(--ring)' : 'none',
        }}
      >
        {leading && <span className="flex text-fg-subtle shrink-0">{leading}</span>}
        <input
          ref={ref}
          disabled={disabled}
          onFocus={e => { setFocused(true); onFocus?.(e) }}
          onBlur={e => { setFocused(false); onBlur?.(e) }}
          className={cn(
            'flex-1 min-w-0 bg-transparent border-none outline-none',
            'text-[13px] text-fg placeholder:text-fg-subtle tracking-[-0.005em]',
            className,
          )}
          {...props}
        />
        {trailing && <span className="flex text-fg-subtle shrink-0">{trailing}</span>}
      </div>
    )
  }
)

TextInput.displayName = 'TextInput'
