import { Outlet, Link, useLocation } from 'react-router-dom'
import { useSourceStore } from '../../store/sourceStore'
import { ThemeToggle } from '../../ui'

function Wordmark() {
  return (
    <Link
      to="/upload"
      className="inline-flex items-center gap-2 text-fg no-underline"
      style={{ textDecoration: 'none' }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="1" y="1" width="16" height="16" rx="4" style={{ fill: 'var(--fg)' }} />
        <path
          d="M4 12.5l3-3.5 3 2 4-5"
          style={{ stroke: 'var(--bg)' }}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-[14px] font-medium tracking-[-0.2px] text-fg">Insight</span>
    </Link>
  )
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s
}

export default function Layout() {
  const { activeSource, activeQuestionTitle } = useSourceStore()
  const location = useLocation()
  const path = location.pathname
  const sourceName = activeSource?.name ?? 'dataset.csv'

  let breadcrumb: React.ReactNode = null

  if (path.startsWith('/mapping')) {
    breadcrumb = (
      <span className="text-[13px] text-fg-muted">{sourceName}</span>
    )
  } else if (path.startsWith('/dashboard')) {
    breadcrumb = (
      <Link
        to="/upload"
        className="text-[13px] text-fg-muted hover:text-fg transition-colors"
        style={{ textDecoration: 'none' }}
      >
        {sourceName}
      </Link>
    )
  } else if (path.startsWith('/question')) {
    const dashPath = activeSource ? `/dashboard/${activeSource.id}` : '/upload'
    const title = activeQuestionTitle ?? 'Question'
    breadcrumb = (
      <>
        <Link
          to={dashPath}
          className="text-[13px] text-fg-muted hover:text-fg transition-colors"
          style={{ textDecoration: 'none' }}
        >
          {sourceName}
        </Link>
        <span className="text-[13px] text-fg-subtle mx-[2px]">/</span>
        <span
          className="text-[13px] text-fg-muted truncate max-w-[440px]"
          title={title}
        >
          {truncate(title, 60)}
        </span>
      </>
    )
  }

  return (
    <div className="min-h-screen bg-bg text-fg flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-bg border-b border-border flex items-center justify-between px-7 py-[14px]">
        <div className="flex items-center gap-3 min-w-0">
          <Wordmark />
          {breadcrumb && (
            <>
              <span className="text-[13px] text-fg-subtle mx-[2px]">/</span>
              <div className="flex items-center gap-[6px] min-w-0">{breadcrumb}</div>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-7 py-5 flex items-center justify-between">
        <span className="text-[11px] font-medium tracking-[0.04em] text-fg-subtle">
          Insight · v0.1 · numbers computed deterministically on pandas, never guessed.
        </span>
        <div className="flex items-center gap-[18px]">
          {(['Docs', 'Changelog', 'Privacy'] as const).map(label => (
            <a
              key={label}
              href="#"
              onClick={e => e.preventDefault()}
              className="text-[11px] font-medium tracking-[0.04em] text-fg-subtle hover:text-fg-muted transition-colors"
              style={{ textDecoration: 'none' }}
            >
              {label}
            </a>
          ))}
        </div>
      </footer>
    </div>
  )
}
