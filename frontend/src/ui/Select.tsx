import { ReactNode, useEffect, useId, useRef, useState, Children, isValidElement } from 'react'
import { cn } from './utils'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps {
  value?: string
  onChange?: (e: { target: { value: string } }) => void
  options?: SelectOption[]
  children?: ReactNode
  leading?: ReactNode
  placeholder?: string
  error?: boolean
  disabled?: boolean
  className?: string
  name?: string
  id?: string
  ['aria-label']?: string
}

// Extract { value, label, disabled } from <option> children — keeps the old API.
function optionsFromChildren(children: ReactNode): SelectOption[] {
  const out: SelectOption[] = []
  Children.forEach(children, child => {
    if (!isValidElement(child)) return
    const props = child.props as { value?: string; children?: ReactNode; disabled?: boolean }
    if (props.value == null) return
    out.push({
      value: String(props.value),
      label: String(props.children ?? props.value),
      disabled: props.disabled,
    })
  })
  return out
}

export function Select({
  value = '',
  onChange,
  options,
  children,
  leading,
  placeholder,
  error,
  disabled,
  className,
  name,
  id,
  ...aria
}: SelectProps) {
  const reactId = useId()
  const listboxId = id ?? `select-${reactId}`
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number>(-1)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const opts = options ?? optionsFromChildren(children)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [open])

  // When opening, seed active index from current value
  useEffect(() => {
    if (!open) return
    const idx = opts.findIndex(o => o.value === value)
    setActiveIndex(idx >= 0 ? idx : 0)
  }, [open])

  const borderColor = focused || open
    ? 'var(--accent)'
    : error
    ? 'var(--danger)'
    : hovered && !disabled
    ? 'var(--accent)'
    : 'var(--border)'

  const shadow = focused || open
    ? '0 0 0 3px var(--ring)'
    : hovered && !disabled
    ? 'color-mix(in oklch, var(--accent) 14%, transparent) 0 0 0 3px'
    : 'none'

  const selected = opts.find(o => o.value === value)
  const displayText = selected?.label ?? placeholder ?? ''
  const isPlaceholder = !selected

  function commit(opt: SelectOption) {
    if (opt.disabled) return
    onChange?.({ target: { value: opt.value } })
    setOpen(false)
    triggerRef.current?.focus()
  }

  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (disabled) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
    }
    if (!open) return
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    else if (e.key === 'ArrowDown') { setActiveIndex(i => Math.min(opts.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp')   { setActiveIndex(i => Math.max(0, i - 1)) }
    else if (e.key === 'Home')      { setActiveIndex(0) }
    else if (e.key === 'End')       { setActiveIndex(opts.length - 1) }
    else if (e.key === 'Enter' || e.key === ' ') {
      const opt = opts[activeIndex]
      if (opt) commit(opt)
    }
  }

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      {name && <input type="hidden" name={name} value={value} />}

      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-disabled={disabled}
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        onKeyDown={onTriggerKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onMouseEnter={() => !disabled && setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          'w-full flex items-center gap-2 h-[34px] px-[10px] bg-surface border rounded-md',
          'transition-[border-color,box-shadow] duration-[120ms]',
          'text-[13px] text-left tracking-[-0.005em]',
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
          'focus-visible:outline-none',
        )}
        style={{ borderColor, boxShadow: shadow }}
        {...aria}
      >
        {leading && <span className="flex text-fg-subtle shrink-0">{leading}</span>}
        <span className={cn('flex-1 min-w-0 truncate', isPlaceholder ? 'text-fg-subtle' : 'text-fg')}>
          {displayText}
        </span>
        <svg
          width="11" height="11" viewBox="0 0 11 11" fill="none"
          strokeWidth="1.5" strokeLinecap="round"
          className="shrink-0 text-fg-subtle stroke-current"
          style={{ transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none' }}
        >
          <path d="M2.5 4.5L5.5 7.5L8.5 4.5" />
        </svg>
      </button>

      {open && opts.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 mt-1 bg-surface border border-border rounded-md py-1 z-20 max-h-[260px] overflow-y-auto"
          style={{ top: '100%', boxShadow: 'var(--shadow-md)' }}
        >
          {opts.map((opt, i) => {
            const isSelected = opt.value === value
            const isActive = i === activeIndex
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                aria-disabled={opt.disabled}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseDown={e => { e.preventDefault(); commit(opt) }}
                className={cn(
                  'flex items-center justify-between gap-2 px-[12px] py-[7px] text-[13px] leading-[1.2]',
                  opt.disabled
                    ? 'text-fg-subtle cursor-not-allowed'
                    : 'cursor-pointer text-fg',
                )}
                style={{
                  background: isActive && !opt.disabled ? 'var(--surface-2)' : 'transparent',
                  fontWeight: isSelected ? 500 : 400,
                }}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && (
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <path d="M2 5.5l2.5 2.5L9 3" />
                  </svg>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
