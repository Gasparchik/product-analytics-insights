import { useTheme } from '../hooks/useTheme'
import { cn } from './utils'

function SunIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <circle cx="6.5" cy="6.5" r="2.4" />
      <path d="M6.5 1.2v1.4M6.5 10.4v1.4M1.2 6.5h1.4M10.4 6.5h1.4M2.7 2.7l1 1M9.3 9.3l1 1M2.7 10.3l1-1M9.3 3.7l1-1" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 7.5A4.5 4.5 0 0 1 5.5 2a4.5 4.5 0 1 0 5.5 5.5z" />
    </svg>
  )
}

const segments = [
  { id: 'light' as const, icon: <SunIcon /> },
  { id: 'dark'  as const, icon: <MoonIcon /> },
]

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, set } = useTheme()

  return (
    <div
      className={cn(
        'inline-flex items-center p-[2px] bg-surface border border-border rounded-md gap-0',
        className,
      )}
    >
      {segments.map(seg => {
        const active = seg.id === theme
        return (
          <button
            key={seg.id}
            type="button"
            onClick={() => set(seg.id)}
            className={cn(
              'flex items-center justify-center w-[26px] h-[22px] rounded-sm cursor-pointer',
              'transition-[background,color] duration-[120ms]',
              'focus-visible:outline-none',
              active ? 'bg-surface-2 text-fg' : 'bg-transparent text-fg-subtle',
            )}
            aria-label={seg.id === 'light' ? 'Light mode' : 'Dark mode'}
          >
            {seg.icon}
          </button>
        )
      })}
    </div>
  )
}
