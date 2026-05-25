export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

/** Type scale → Tailwind utility string */
export const type = {
  display: 'text-[32px] font-medium tracking-[-0.5px] leading-tight',
  h1:      'text-[22px] font-medium tracking-[-0.3px] leading-tight',
  h2:      'text-[17px] font-medium tracking-[-0.2px] leading-snug',
  body:    'text-[14px] font-normal tracking-[-0.005em] leading-normal',
  small:   'text-[13px] font-normal tracking-[-0.005em] leading-normal',
  caption: 'text-[12px] font-medium tracking-[0] leading-none',
  meta:    'text-[11px] font-medium tracking-[0.04em] leading-none',
  numeric: 'text-[28px] font-medium tracking-[-0.6px] leading-none tabular-nums',
  mono:    'text-[12px] font-normal tracking-[0] font-mono leading-none',
} as const
