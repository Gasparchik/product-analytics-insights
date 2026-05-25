import { useState } from 'react'

export function InfoTip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false)

  return (
    <span
      className="relative flex cursor-help text-fg-subtle hover:text-fg-muted transition-colors"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="5" />
        <path d="M6 5.5v2.5" strokeWidth="1.6" />
        <circle cx="6" cy="3.75" r="0.5" fill="currentColor" stroke="none" />
      </svg>

      <span
        role="tooltip"
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-[6px] w-[220px] px-[9px] py-[7px] text-[11px] leading-[1.45] rounded-md z-50 pointer-events-none whitespace-normal transition-opacity duration-[80ms]"
        style={{
          background: 'var(--fg)',
          color: 'var(--bg)',
          opacity: visible ? 1 : 0,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
      >
        {text}
        <span
          className="absolute top-full left-1/2 -translate-x-1/2"
          style={{
            width: 0, height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: '5px solid var(--fg)',
          }}
        />
      </span>
    </span>
  )
}
