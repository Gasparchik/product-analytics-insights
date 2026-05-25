import { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './utils'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  leading?: ReactNode
  trailing?: ReactNode
  full?: boolean
}

const sizeStyles = {
  sm: 'h-[26px] px-[10px] text-[12px] gap-[6px]',
  md: 'h-[32px] px-[12px] text-[13px] gap-[6px]',
  lg: 'h-[38px] px-[16px] text-[14px] gap-[8px]',
}

const variantStyles = {
  primary: 'bg-accent hover:bg-accent-hover text-accent-fg border-transparent',
  secondary: 'bg-surface hover:bg-surface-2 text-fg border-border',
  ghost: 'bg-transparent hover:bg-surface-2 text-fg-muted border-transparent',
  danger: 'bg-transparent hover:bg-danger text-danger hover:text-white border-border hover:border-danger',
}

export function Button({
  variant = 'primary',
  size = 'md',
  leading,
  trailing,
  full,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center font-medium rounded-md border cursor-pointer',
        'transition-[background,color,border-color] duration-[120ms]',
        'active:translate-y-[0.5px]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
        'whitespace-nowrap tracking-[-0.005em] leading-none',
        sizeStyles[size],
        variantStyles[variant],
        full && 'w-full',
        className,
      )}
      style={{ ['--tw-ring-color' as string]: 'var(--ring)' }}
      {...props}
    >
      {leading && <span className="flex shrink-0">{leading}</span>}
      {children}
      {trailing && <span className="flex shrink-0">{trailing}</span>}
    </button>
  )
}
