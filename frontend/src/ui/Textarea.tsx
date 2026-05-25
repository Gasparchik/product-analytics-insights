import { TextareaHTMLAttributes, forwardRef, useState } from 'react'
import { cn } from './utils'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, onFocus, onBlur, ...props }, ref) => {
    const [focused, setFocused] = useState(false)

    return (
      <textarea
        ref={ref}
        onFocus={e => { setFocused(true); onFocus?.(e) }}
        onBlur={e => { setFocused(false); onBlur?.(e) }}
        className={cn(
          'w-full px-[10px] py-[8px] bg-surface text-fg',
          'border rounded-md outline-none resize-y',
          'text-[13px] tracking-[-0.005em] leading-normal',
          'placeholder:text-fg-subtle',
          'transition-[border-color,box-shadow] duration-[120ms]',
          className,
        )}
        style={{
          borderColor: focused ? 'var(--accent)' : 'var(--border)',
          boxShadow: focused ? '0 0 0 3px var(--ring)' : 'none',
        }}
        {...props}
      />
    )
  }
)

Textarea.displayName = 'Textarea'
